/**
 * Script to sync plan_tier in profiles with actual Stripe subscription data
 * Run with: npx ts-node scripts/sync-subscription-tiers.ts
 */

import * as dotenv from 'dotenv'
dotenv.config()

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY is not set')
  process.exit(1)
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Supabase env vars are not set')
  process.exit(1)
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-10-29.clover' as any,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Escalations per tier
const TIER_ESCALATIONS: Record<string, number> = {
  'Premium': 1,
  'Premium Processor': 1,
  'Elite': 6,
  'Elite Processor': 3,
  'VIP': 9999,
  'VIP Processor': 6,
  'Premium Guest': 0,
  'Premium Processor Guest': 0,
}

// Price ID to plan tier mapping
const PRICE_TO_TIER: Record<string, string> = {
  // LO/Broker plans
  'price_1PtZoCKq6gZ6OHL8NhK2QLQA': 'Premium', // annual
  'price_1PtZmdKq6gZ6OHL8b8D2okBw': 'Premium', // monthly
  'price_1PtZvAKq6gZ6OHL8AKsPuIYS': 'Elite', // annual
  'price_1PtZuiKq6gZ6OHL8dRdkjr8G': 'Elite', // monthly
  'price_1PtZwTKq6gZ6OHL8zRSVLHKi': 'VIP', // annual
  'price_1PtZw5Kq6gZ6OHL8SlbrZqOA': 'VIP', // monthly
  // Processor plans
  'price_1RhZUuKq6gZ6OHL8ZZtf3w8g': 'Premium Processor', // annual
  'price_1RhZUuKq6gZ6OHL8l77hU8fR': 'Premium Processor', // monthly
  'price_1RhZVyKq6gZ6OHL8e5GtRB3r': 'Elite Processor', // annual
  'price_1RhZVaKq6gZ6OHL8DcBogOUv': 'Elite Processor', // monthly
  'price_1RhZWtKq6gZ6OHL8C0YVDBR1': 'VIP Processor', // annual
  'price_1RhZWaKq6gZ6OHL8kdecStbM': 'VIP Processor', // monthly
}

async function syncSubscriptionTiers() {
  console.log('Fetching profiles with mismatched tiers...')

  // Get profiles with active subscriptions but wrong tiers
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, plan_tier, stripe_subscription_id, stripe_customer_id')
    .not('stripe_subscription_id', 'is', null)
    .eq('subscription_status', 'active')
    .in('plan_tier', ['Pending Checkout', 'None'])

  if (error) {
    console.error('Error fetching profiles:', error)
    return
  }

  console.log(`Found ${profiles?.length || 0} profiles to check\n`)

  const fixes: Array<{ email: string; oldTier: string; newTier: string; subscriptionId: string }> = []
  const errors: Array<{ email: string; error: string }> = []

  for (const profile of profiles || []) {
    try {
      // Get subscription from Stripe
      const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id)

      if (subscription.status !== 'active' && subscription.status !== 'trialing') {
        console.log(`⚠️  ${profile.email}: Subscription status is ${subscription.status}, skipping`)
        continue
      }

      // Get the price ID
      const priceId = subscription.items.data[0]?.price?.id
      if (!priceId) {
        errors.push({ email: profile.email, error: 'No price ID found' })
        continue
      }

      // Look up the tier - use actual subscription tier regardless of status
      // Premium Guest is deprecated - users get their actual subscription tier
      const newTier = PRICE_TO_TIER[priceId]

      if (!newTier) {
        errors.push({ email: profile.email, error: `Unknown price ID: ${priceId}` })
        continue
      }

      if (newTier !== profile.plan_tier) {
        fixes.push({
          email: profile.email,
          oldTier: profile.plan_tier,
          newTier,
          subscriptionId: profile.stripe_subscription_id,
        })

        // Get escalations for this tier
        const escalations = TIER_ESCALATIONS[newTier] ?? 0

        // Update the profile
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            plan_tier: newTier,
            stripe_subscription_status: subscription.status,
            subscription_status: subscription.status,
            escalations_remaining: escalations,
            escalations_last_reset_date: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', profile.id)

        if (updateError) {
          errors.push({ email: profile.email, error: `Update failed: ${updateError.message}` })
        } else {
          console.log(`✅ ${profile.email}: ${profile.plan_tier} → ${newTier}`)
        }
      }
    } catch (err: any) {
      errors.push({ email: profile.email, error: err.message })
    }
  }

  console.log('\n========== SUMMARY ==========')
  console.log(`Fixed: ${fixes.length}`)
  console.log(`Errors: ${errors.length}`)

  if (errors.length > 0) {
    console.log('\nErrors:')
    errors.forEach(e => console.log(`  - ${e.email}: ${e.error}`))
  }
}

// Run the sync
syncSubscriptionTiers()
  .then(() => {
    console.log('\nDone!')
    process.exit(0)
  })
  .catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
