import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/config'
import Stripe from 'stripe'
import { getBasePlanEscalations } from '@/lib/escalations'

// Plan tier hierarchy for comparison
const PLAN_HIERARCHY: Record<string, number> = {
  'None': 0,
  'Pending Checkout': 0,
  'Premium Guest': 0,
  'Premium': 1,
  'Premium Processor': 1,
  'Elite': 2,
  'Elite Processor': 2,
  'VIP': 3,
  'VIP Processor': 3,
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { targetPlanTier, billingInterval } = await request.json()

    if (!targetPlanTier) {
      return NextResponse.json(
        { error: 'Target plan tier is required' },
        { status: 400 }
      )
    }

    // Get user's current profile and subscription info
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('plan_tier, stripe_subscription_id, stripe_customer_id, pending_plan_tier, email, full_name, first_name')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      )
    }

    if (!profile.stripe_subscription_id) {
      return NextResponse.json(
        { error: 'No active subscription found. Please use the checkout flow.' },
        { status: 400 }
      )
    }

    // Verify this is actually an upgrade
    const currentTier = PLAN_HIERARCHY[profile.plan_tier] ?? 0
    const targetTier = PLAN_HIERARCHY[targetPlanTier] ?? 0

    if (targetTier <= currentTier) {
      return NextResponse.json(
        { error: 'This is not an upgrade. Please use the downgrade flow.' },
        { status: 400 }
      )
    }

    // Get the target plan's Stripe price ID
    const { data: targetPlan, error: planError } = await supabase
      .from('subscription_plans')
      .select('stripe_price_id, name, price')
      .eq('plan_tier', targetPlanTier)
      .eq('billing_period', billingInterval || 'annual')
      .eq('is_active', true)
      .single()

    if (planError || !targetPlan?.stripe_price_id) {
      return NextResponse.json(
        { error: 'Target plan not found' },
        { status: 400 }
      )
    }

    // Get the current subscription from Stripe
    const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id) as Stripe.Subscription

    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return NextResponse.json(
        { error: 'Subscription is not active' },
        { status: 400 }
      )
    }

    // If there's a pending downgrade, cancel it first
    if (profile.pending_plan_tier || subscription.cancel_at_period_end) {
      // Remove cancel_at_period_end flag
      await stripe.subscriptions.update(
        profile.stripe_subscription_id,
        {
          cancel_at_period_end: false,
          metadata: {
            pending_downgrade_tier: '',
            pending_downgrade_price_id: '',
            pending_downgrade_billing_interval: '',
          }
        }
      )

      // Clear pending downgrade in DB
      await supabase
        .from('profiles')
        .update({
          pending_plan_tier: null,
          pending_plan_effective_date: null,
          pending_plan_price_id: null,
        })
        .eq('id', user.id)
    }

    // Upgrade immediately with proration and reset billing anchor
    const updatedSubscription = await stripe.subscriptions.update(
      profile.stripe_subscription_id,
      {
        items: [{
          id: subscription.items.data[0].id,
          price: targetPlan.stripe_price_id,
        }],
        proration_behavior: 'always_invoice', // Charge prorated amount immediately
        billing_cycle_anchor: 'now', // Reset billing date to now
        metadata: {
          plan_tier: targetPlanTier,
        }
      }
    )

    // Update the profile with the new tier and reset escalations
    const newEscalations = getBasePlanEscalations(targetPlanTier)
    await supabase
      .from('profiles')
      .update({
        plan_tier: targetPlanTier,
        stripe_subscription_status: updatedSubscription.status,
        escalations_remaining: newEscalations,
        escalations_last_reset_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    // Send upgrade confirmation email to member
    if (profile.email) {
      try {
        const firstName = profile.first_name || profile.full_name?.split(' ')[0] || 'Member'
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-member-subscription-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            type: 'upgrade',
            memberEmail: profile.email,
            firstName,
            tierName: targetPlanTier,
          }),
        })
      } catch (emailError) {
        console.error('Error sending member upgrade email:', emailError)
        // Don't fail the upgrade if email fails
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully upgraded to ${targetPlanTier}!`,
      newPlan: targetPlanTier,
      effectiveImmediately: true,
    })

  } catch (error: any) {
    console.error('Upgrade error:', error)

    // Handle specific Stripe errors
    if (error.type === 'StripeCardError') {
      return NextResponse.json(
        { error: 'Payment failed. Please update your payment method.' },
        { status: 402 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to process upgrade' },
      { status: 500 }
    )
  }
}
