/**
 * Fix Premium Guest Tiers
 *
 * This script fixes users incorrectly set to "Premium Guest" by:
 * 1. Fetching all users with plan_tier = 'Premium Guest'
 * 2. Looking up their actual Stripe subscription
 * 3. Determining the correct tier from the price ID
 * 4. Updating their profile with the correct tier
 * 5. GHL sync happens automatically via database trigger
 *
 * Run with: npx ts-node scripts/fix-premium-guest-tiers.ts --report
 *           npx ts-node scripts/fix-premium-guest-tiers.ts --fix
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

const REPORT_MODE = process.argv.includes('--report')
const FIX_MODE = process.argv.includes('--fix')

// Escalations per tier
const TIER_ESCALATIONS: Record<string, number> = {
  'Premium': 1,
  'Premium Processor': 1,
  'Elite': 6,
  'Elite Processor': 3,
  'VIP': 9999,
  'VIP Processor': 6,
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

// Fallback: determine tier from price amount
function getTierFromAmount(amount: number, interval: string): string {
  const monthly = interval === 'month' ? amount : amount / 12

  if (monthly >= 15000) return 'VIP'      // $150+/mo
  if (monthly >= 5000) return 'Elite'     // $50+/mo
  if (monthly >= 1000) return 'Premium'   // $10+/mo
  return 'Premium' // Default to Premium for any paid subscription
}

async function fixPremiumGuestTiers() {
  console.log('=========================================================')
  console.log('   FIX PREMIUM GUEST TIERS')
  console.log('=========================================================')
  console.log(`   Mode: ${REPORT_MODE ? 'REPORT (read-only)' : FIX_MODE ? 'FIX (will update)' : 'NONE'}`)
  console.log('=========================================================\n')

  if (!REPORT_MODE && !FIX_MODE) {
    console.log('Usage:')
    console.log('  --report    Show what would be fixed (read-only)')
    console.log('  --fix       Actually fix the tiers (GHL syncs via trigger)')
    console.log('\nExample:')
    console.log('  npx ts-node scripts/fix-premium-guest-tiers.ts --report')
    console.log('  npx ts-node scripts/fix-premium-guest-tiers.ts --fix')
    return
  }

  // Fetch all Premium Guest users with Stripe subscription
  console.log('Fetching Premium Guest users with Stripe subscriptions...\n')

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, plan_tier, stripe_subscription_id, stripe_customer_id, ghl_contact_id')
    .eq('plan_tier', 'Premium Guest')
    .not('stripe_subscription_id', 'is', null)

  if (error) {
    console.error('Error fetching profiles:', error)
    return
  }

  console.log(`Found ${profiles?.length || 0} Premium Guest users with Stripe subscriptions\n`)

  if (!profiles || profiles.length === 0) {
    console.log('No users to fix.\n')
    return
  }

  const results = {
    total: profiles.length,
    fixed: 0,
    skipped: 0,
    errors: [] as Array<{ email: string; error: string }>,
    fixes: [] as Array<{ email: string; oldTier: string; newTier: string }>,
  }

  for (const profile of profiles) {
    try {
      // Get subscription from Stripe
      let subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id)

      // If subscription is canceled, check if customer has another active subscription
      if (!['active', 'trialing', 'past_due'].includes(subscription.status)) {
        console.log(`   ${profile.email}: Stored subscription is ${subscription.status}, checking for other active subscriptions...`)

        // Search for active subscriptions by customer ID
        if (profile.stripe_customer_id) {
          const activeSubscriptions = await stripe.subscriptions.list({
            customer: profile.stripe_customer_id,
            status: 'active',
            limit: 1,
          })

          const trialingSubscriptions = await stripe.subscriptions.list({
            customer: profile.stripe_customer_id,
            status: 'trialing',
            limit: 1,
          })

          const foundSubscription = activeSubscriptions.data[0] || trialingSubscriptions.data[0]

          if (foundSubscription) {
            console.log(`   ✓ Found active subscription: ${foundSubscription.id}`)
            subscription = foundSubscription as any
          } else {
            console.log(`⚠️  ${profile.email}: No active subscriptions found, skipping`)
            results.skipped++
            continue
          }
        } else {
          console.log(`⚠️  ${profile.email}: No customer ID to search, skipping`)
          results.skipped++
          continue
        }
      }

      // Get the price ID and determine correct tier
      const priceId = subscription.items.data[0]?.price?.id
      const price = subscription.items.data[0]?.price

      if (!priceId) {
        results.errors.push({ email: profile.email, error: 'No price ID found' })
        continue
      }

      // Look up tier from known prices, or fallback to amount-based
      let correctTier = PRICE_TO_TIER[priceId]

      if (!correctTier && price) {
        // Fallback: determine from amount
        correctTier = getTierFromAmount(
          price.unit_amount || 0,
          price.recurring?.interval || 'month'
        )
        console.log(`   ${profile.email}: Unknown price ${priceId}, determined ${correctTier} from amount $${(price.unit_amount || 0) / 100}`)
      }

      if (!correctTier) {
        results.errors.push({ email: profile.email, error: `Could not determine tier for price: ${priceId}` })
        continue
      }

      // Record the fix
      results.fixes.push({
        email: profile.email,
        oldTier: profile.plan_tier,
        newTier: correctTier,
      })

      if (FIX_MODE) {
        // Get escalations for this tier
        const escalations = TIER_ESCALATIONS[correctTier] ?? 0

        // Update the profile (including new subscription ID if found)
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            plan_tier: correctTier,
            stripe_subscription_id: subscription.id,
            subscription_status: subscription.status,
            stripe_subscription_status: subscription.status,
            escalations_remaining: escalations,
            escalations_last_reset_date: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', profile.id)

        if (updateError) {
          results.errors.push({ email: profile.email, error: `Update failed: ${updateError.message}` })
          continue
        }

        // GHL sync happens automatically via database trigger
        console.log(`   ✅ ${profile.email}: ${profile.plan_tier} → ${correctTier}`)
        results.fixed++
      } else {
        console.log(`   Would fix: ${profile.email}: ${profile.plan_tier} → ${correctTier}`)
        results.fixed++
      }

    } catch (err: any) {
      results.errors.push({ email: profile.email, error: err.message })
    }
  }

  // Print summary
  console.log('\n=========================================================')
  console.log('   SUMMARY')
  console.log('=========================================================\n')

  console.log(`Total Premium Guest users:  ${results.total}`)
  console.log(`${FIX_MODE ? 'Fixed' : 'Would fix'}:              ${results.fixed}`)
  console.log(`Skipped (inactive):         ${results.skipped}`)
  console.log(`Errors:                     ${results.errors.length}`)

  if (results.fixes.length > 0) {
    console.log('\nFixes:')
    results.fixes.forEach(f => console.log(`   ${f.email}: ${f.oldTier} → ${f.newTier}`))
  }

  if (results.errors.length > 0) {
    console.log('\nErrors:')
    results.errors.forEach(e => console.log(`   ${e.email}: ${e.error}`))
  }

  console.log('\n=========================================================\n')

  if (!FIX_MODE && results.fixes.length > 0) {
    console.log('Run with --fix to apply these changes.\n')
  }
}

// Run the fix
fixPremiumGuestTiers()
  .then(() => {
    console.log('Done!')
    process.exit(0)
  })
  .catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
