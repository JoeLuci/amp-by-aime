import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'
import { getBasePlanEscalations } from '@/lib/escalations'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover',
})

interface SyncResult {
  userId: string
  email: string
  success: boolean
  previousTier?: string
  newTier?: string
  status?: string
  error?: string
}

// POST - Sync all subscriptions from Stripe
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Check if user is authenticated and is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Get all users with Stripe subscription IDs
    const { data: usersWithSubs, error: usersError } = await supabase
      .from('profiles')
      .select('id, email, stripe_subscription_id, plan_tier, subscription_status')
      .not('stripe_subscription_id', 'is', null)
      .neq('stripe_subscription_id', '')

    if (usersError) {
      console.error('Error fetching users:', usersError)
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    if (!usersWithSubs || usersWithSubs.length === 0) {
      return NextResponse.json({
        message: 'No users with Stripe subscriptions found',
        results: [],
        summary: { total: 0, synced: 0, failed: 0, skipped: 0 }
      })
    }

    // Get all subscription plans for price ID lookup
    const { data: allPlans, error: plansError } = await supabase
      .from('subscription_plans')
      .select('stripe_price_id, plan_tier')

    if (plansError) {
      console.error('Error fetching plans:', plansError)
      return NextResponse.json({ error: 'Failed to fetch subscription plans' }, { status: 500 })
    }

    // Create a map of price ID to plan tier
    const priceToTierMap = new Map<string, string>()
    allPlans?.forEach(plan => {
      if (plan.stripe_price_id) {
        priceToTierMap.set(plan.stripe_price_id, plan.plan_tier)
      }
    })

    const results: SyncResult[] = []
    let synced = 0
    let failed = 0
    let skipped = 0

    // Process each user
    for (const userProfile of usersWithSubs) {
      try {
        // Fetch subscription from Stripe
        const syncSub = await stripe.subscriptions.retrieve(
          userProfile.stripe_subscription_id!,
          { expand: ['items.data.price'] }
        )

        const syncPriceId = syncSub.items.data[0]?.price?.id
        if (!syncPriceId) {
          results.push({
            userId: userProfile.id,
            email: userProfile.email || 'Unknown',
            success: false,
            error: 'Could not get price from Stripe subscription'
          })
          failed++
          continue
        }

        // Look up the plan tier from the price ID
        const syncTier = priceToTierMap.get(syncPriceId)
        if (!syncTier) {
          results.push({
            userId: userProfile.id,
            email: userProfile.email || 'Unknown',
            success: false,
            error: `Unknown price ID: ${syncPriceId}`
          })
          failed++
          continue
        }

        // Determine the correct status
        const isPaused = syncSub.pause_collection !== null
        const syncStatus = isPaused ? 'paused' : syncSub.status

        // Check if anything actually changed
        if (userProfile.plan_tier === syncTier && userProfile.subscription_status === syncStatus) {
          results.push({
            userId: userProfile.id,
            email: userProfile.email || 'Unknown',
            success: true,
            previousTier: userProfile.plan_tier,
            newTier: syncTier,
            status: syncStatus,
            error: 'Already in sync'
          })
          skipped++
          continue
        }

        // Get escalations for the tier
        const syncEscalations = getBasePlanEscalations(syncTier)

        // Update the database
        const { error: syncUpdateError } = await supabase
          .from('profiles')
          .update({
            plan_tier: syncTier,
            subscription_status: syncStatus,
            stripe_subscription_status: syncSub.status,
            escalations_remaining: syncEscalations,
            escalations_last_reset_date: new Date().toISOString(),
            subscription_override: false,
            override_plan_tier: null,
            override_subscription_status: null,
            override_reason: null,
            override_set_by: null,
            override_set_at: null,
            override_expires_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userProfile.id)

        if (syncUpdateError) {
          results.push({
            userId: userProfile.id,
            email: userProfile.email || 'Unknown',
            success: false,
            error: `Database update failed: ${syncUpdateError.message}`
          })
          failed++
          continue
        }

        results.push({
          userId: userProfile.id,
          email: userProfile.email || 'Unknown',
          success: true,
          previousTier: userProfile.plan_tier,
          newTier: syncTier,
          status: syncStatus
        })
        synced++

      } catch (stripeError: any) {
        // Handle Stripe errors (e.g., subscription not found)
        results.push({
          userId: userProfile.id,
          email: userProfile.email || 'Unknown',
          success: false,
          error: stripeError.message || 'Stripe API error'
        })
        failed++
      }
    }

    return NextResponse.json({
      message: `Sync complete: ${synced} synced, ${skipped} already in sync, ${failed} failed`,
      results,
      summary: {
        total: usersWithSubs.length,
        synced,
        skipped,
        failed
      }
    })

  } catch (error: any) {
    console.error('Error in POST /api/admin/subscriptions/sync-all:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to sync subscriptions' },
      { status: 500 }
    )
  }
}
