/**
 * Backfill historical subscription changes into conversion_attributions
 * Run with: npx ts-node scripts/backfill-subscription-history.ts
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

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

const TIER_ORDER = ['Premium', 'Premium Processor', 'Elite', 'Elite Processor', 'VIP', 'VIP Processor']

function getConversionType(fromTier: string, toTier: string): string {
  if (toTier === 'Canceled') return 'cancellation'
  const fromIndex = TIER_ORDER.indexOf(fromTier)
  const toIndex = TIER_ORDER.indexOf(toTier)
  return toIndex > fromIndex ? 'upgrade' : 'downgrade'
}

async function backfillSubscriptionHistory() {
  // Last 11 days
  const daysBack = 11
  const since = Math.floor(Date.now() / 1000) - (daysBack * 24 * 60 * 60)

  console.log(`Fetching Stripe events from the last ${daysBack} days...\n`)

  const conversions: Array<{
    user_id: string
    email: string
    conversion_type: string
    from_tier: string
    to_tier: string
    conversion_date: string
  }> = []

  // Get subscription updated events (upgrades/downgrades)
  console.log('Fetching customer.subscription.updated events...')
  const updateEvents = await stripe.events.list({
    type: 'customer.subscription.updated',
    created: { gte: since },
    limit: 100,
  })
  console.log(`Found ${updateEvents.data.length} subscription update events`)

  for (const event of updateEvents.data) {
    const sub = event.data.object as Stripe.Subscription
    const previousAttributes = (event.data as any).previous_attributes
    const customerId = sub.customer as string

    // Check if the price/plan changed
    if (previousAttributes?.items) {
      const newPriceId = sub.items.data[0]?.price?.id
      const newTier = newPriceId ? PRICE_TO_TIER[newPriceId] : null

      // Get old price from previous_attributes
      const oldPriceId = previousAttributes.items?.data?.[0]?.price?.id
      const oldTier = oldPriceId ? PRICE_TO_TIER[oldPriceId] : null

      if (newTier && oldTier && newTier !== oldTier) {
        // Get user by stripe customer
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, email')
          .eq('stripe_customer_id', customerId)
          .single()

        if (profile) {
          const conversionType = getConversionType(oldTier, newTier)
          conversions.push({
            user_id: profile.id,
            email: profile.email,
            conversion_type: conversionType,
            from_tier: oldTier,
            to_tier: newTier,
            conversion_date: new Date(event.created * 1000).toISOString(),
          })
        }
      }
    }
  }

  // Get subscription deleted events (cancellations)
  console.log('Fetching customer.subscription.deleted events...')
  const deleteEvents = await stripe.events.list({
    type: 'customer.subscription.deleted',
    created: { gte: since },
    limit: 100,
  })
  console.log(`Found ${deleteEvents.data.length} cancellation events`)

  for (const event of deleteEvents.data) {
    const sub = event.data.object as Stripe.Subscription
    const customerId = sub.customer as string
    const priceId = sub.items.data[0]?.price?.id
    const tier = priceId ? PRICE_TO_TIER[priceId] : 'Unknown'

    // Get user by stripe customer - check if they have an active subscription now
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, stripe_subscription_id, subscription_status')
      .eq('stripe_customer_id', customerId)
      .single()

    // Skip if user currently has an active subscription (was a migration, not cancellation)
    if (profile?.stripe_subscription_id && profile?.subscription_status === 'active') {
      console.log(`  Skipping ${profile.email}: has active subscription (migration, not cancellation)`)
      continue
    }

    if (profile && tier !== 'Unknown') {
      conversions.push({
        user_id: profile.id,
        email: profile.email,
        conversion_type: 'cancellation',
        from_tier: tier,
        to_tier: 'Canceled',
        conversion_date: new Date(event.created * 1000).toISOString(),
      })
    }
  }

  console.log(`\nFound ${conversions.length} historical conversions\n`)

  // Preview conversions
  console.log('Preview of conversions to insert:')
  console.log('='.repeat(80))

  const grouped = {
    signup: conversions.filter(c => c.conversion_type === 'signup'),
    upgrade: conversions.filter(c => c.conversion_type === 'upgrade'),
    downgrade: conversions.filter(c => c.conversion_type === 'downgrade'),
    cancellation: conversions.filter(c => c.conversion_type === 'cancellation'),
  }

  console.log(`Signups: ${grouped.signup.length}`)
  console.log(`Upgrades: ${grouped.upgrade.length}`)
  console.log(`Downgrades: ${grouped.downgrade.length}`)
  console.log(`Cancellations: ${grouped.cancellation.length}`)

  console.log('\nSample records:')
  conversions.slice(0, 10).forEach(c => {
    console.log(`  ${c.email}: ${c.conversion_type} (${c.from_tier} → ${c.to_tier}) on ${c.conversion_date.split('T')[0]}`)
  })

  // Ask for confirmation
  console.log('\n' + '='.repeat(80))
  console.log('To insert these records, run with --confirm flag:')
  console.log('npx ts-node scripts/backfill-subscription-history.ts --confirm')

  if (process.argv.includes('--confirm')) {
    console.log('\nInserting records...')

    for (const conversion of conversions) {
      try {
        // Check if already exists
        const { data: existing } = await supabase
          .from('conversion_attributions')
          .select('id')
          .eq('user_id', conversion.user_id)
          .eq('conversion_type', conversion.conversion_type)
          .eq('from_tier', conversion.from_tier)
          .eq('to_tier', conversion.to_tier)
          .single()

        if (existing) {
          console.log(`  Skipping duplicate: ${conversion.email} ${conversion.conversion_type}`)
          continue
        }

        const { error } = await supabase
          .from('conversion_attributions')
          .insert({
            user_id: conversion.user_id,
            conversion_type: conversion.conversion_type,
            from_tier: conversion.from_tier,
            to_tier: conversion.to_tier,
            conversion_date: conversion.conversion_date,
          })

        if (error) {
          console.error(`  Error inserting ${conversion.email}:`, error.message)
        } else {
          console.log(`  ✅ ${conversion.email}: ${conversion.conversion_type}`)
        }
      } catch (err: any) {
        console.error(`  Error: ${err.message}`)
      }
    }

    console.log('\nDone!')
  }
}

backfillSubscriptionHistory()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
