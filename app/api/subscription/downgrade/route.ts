import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/config'
import Stripe from 'stripe'

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
      .select('plan_tier, stripe_subscription_id, stripe_customer_id, email, full_name, first_name')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      )
    }

    // STRIPE IS SOURCE OF TRUTH: Fetch current subscription by customer ID
    if (!profile.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No payment account found. Please contact support.' },
        { status: 400 }
      )
    }

    // Verify this is actually a downgrade
    const currentTier = PLAN_HIERARCHY[profile.plan_tier] ?? 0
    const targetTier = PLAN_HIERARCHY[targetPlanTier] ?? 0

    if (targetTier >= currentTier) {
      return NextResponse.json(
        { error: 'This is not a downgrade. Please use the regular checkout flow.' },
        { status: 400 }
      )
    }

    // Verify target plan exists
    const { data: targetPlan, error: planError } = await supabase
      .from('subscription_plans')
      .select('stripe_price_id, name')
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

    // Get the customer's current active subscription from Stripe
    let subscription: Stripe.Subscription | null = null
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: profile.stripe_customer_id,
        status: 'active',
        limit: 1
      })

      if (subscriptions.data.length === 0) {
        // Check for trialing subscriptions
        const trialingSubscriptions = await stripe.subscriptions.list({
          customer: profile.stripe_customer_id,
          status: 'trialing',
          limit: 1
        })
        if (trialingSubscriptions.data.length > 0) {
          subscription = trialingSubscriptions.data[0]
        }
      } else {
        subscription = subscriptions.data[0]
      }

      if (!subscription) {
        return NextResponse.json(
          { error: 'No active subscription found in Stripe. Please contact support.' },
          { status: 400 }
        )
      }

      // Self-heal: Update database if subscription ID is stale
      if (subscription.id !== profile.stripe_subscription_id) {
        console.log(`Self-healing subscription ID for downgrade: ${profile.stripe_subscription_id} -> ${subscription.id}`)
        await supabase
          .from('profiles')
          .update({
            stripe_subscription_id: subscription.id,
            subscription_status: subscription.status,
            stripe_subscription_status: subscription.status,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id)
      }
    } catch (stripeError: any) {
      if (stripeError.code === 'resource_missing') {
        return NextResponse.json(
          { error: 'Payment account not found. Please contact support.' },
          { status: 400 }
        )
      }
      throw stripeError
    }

    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return NextResponse.json(
        { error: 'Subscription is not active' },
        { status: 400 }
      )
    }

    // Cancel current subscription at period end
    // DON'T change anything in Stripe yet - just mark for cancellation
    await stripe.subscriptions.update(
      subscription.id,
      {
        cancel_at_period_end: true,
        metadata: {
          pending_downgrade_tier: targetPlanTier,
          pending_downgrade_price_id: targetPlan.stripe_price_id,
          pending_downgrade_billing_interval: billingInterval || 'annual',
        }
      }
    )

    // Calculate when the downgrade will take effect
    // Fetch from upcoming invoice since new Stripe API doesn't have current_period_end on subscription
    let currentPeriodEnd: number | null = null
    try {
      const upcomingInvoice = await (stripe.invoices as any).upcoming({
        customer: profile.stripe_customer_id,
        subscription: subscription.id
      })
      currentPeriodEnd = upcomingInvoice.period_end
    } catch (invErr) {
      // Fallback: calculate from billing_cycle_anchor
      const sub = subscription as any
      if (sub.billing_cycle_anchor) {
        const anchor = new Date(sub.billing_cycle_anchor * 1000)
        const interval = subscription.items?.data?.[0]?.price?.recurring?.interval || 'month'
        const now = new Date()
        while (anchor <= now) {
          if (interval === 'month') {
            anchor.setMonth(anchor.getMonth() + 1)
          } else {
            anchor.setFullYear(anchor.getFullYear() + 1)
          }
        }
        currentPeriodEnd = Math.floor(anchor.getTime() / 1000)
      }
    }

    // Validate currentPeriodEnd exists
    if (!currentPeriodEnd) {
      console.error('Could not determine current_period_end for subscription:', subscription.id)
      return NextResponse.json(
        { error: 'Unable to determine subscription end date. Please contact support.' },
        { status: 400 }
      )
    }

    const effectiveDate = new Date(currentPeriodEnd * 1000)

    // Store the pending downgrade in the database
    // User keeps current tier until subscription actually ends
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        pending_plan_tier: targetPlanTier,
        pending_plan_effective_date: effectiveDate.toISOString(),
        pending_plan_price_id: targetPlan.stripe_price_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('Error storing pending downgrade:', updateError)
    }

    // Send downgrade confirmation email to member
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
            type: 'downgrade',
            memberEmail: profile.email,
            firstName,
            subscriptionEndDate: effectiveDate.toISOString(),
          }),
        })
      } catch (emailError) {
        console.error('Error sending member downgrade email:', emailError)
        // Don't fail the downgrade if email fails
      }
    }

    return NextResponse.json({
      success: true,
      message: `Your plan will change to ${targetPlanTier} on ${effectiveDate.toLocaleDateString()}`,
      effectiveDate: effectiveDate.toISOString(),
      currentPlan: profile.plan_tier,
      pendingPlan: targetPlanTier,
    })

  } catch (error) {
    console.error('Downgrade error:', error)
    return NextResponse.json(
      { error: 'Failed to schedule downgrade' },
      { status: 500 }
    )
  }
}

// Cancel a pending downgrade
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user's profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('plan_tier, pending_plan_tier, stripe_subscription_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      )
    }

    if (!profile.pending_plan_tier) {
      return NextResponse.json(
        { error: 'No pending downgrade to cancel' },
        { status: 400 }
      )
    }

    if (!profile.stripe_subscription_id) {
      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 400 }
      )
    }

    // Remove the cancel_at_period_end flag and clear metadata
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

    // Clear the pending downgrade from the database
    await supabase
      .from('profiles')
      .update({
        pending_plan_tier: null,
        pending_plan_effective_date: null,
        pending_plan_price_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    return NextResponse.json({
      success: true,
      message: 'Pending downgrade cancelled. Your current plan will continue.',
    })

  } catch (error) {
    console.error('Cancel downgrade error:', error)
    return NextResponse.json(
      { error: 'Failed to cancel downgrade' },
      { status: 500 }
    )
  }
}
