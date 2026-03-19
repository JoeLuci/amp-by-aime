import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/config'
import Stripe from 'stripe'

// POST - Cancel subscription at period end
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

    // Get user's current profile and subscription info
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('plan_tier, stripe_subscription_id, stripe_customer_id, subscription_status, email, full_name, first_name')
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

      // Also check past_due - users should be able to cancel past_due subscriptions
      if (!subscription) {
        const pastDueSubscriptions = await stripe.subscriptions.list({
          customer: profile.stripe_customer_id,
          status: 'past_due',
          limit: 1
        })
        if (pastDueSubscriptions.data.length > 0) {
          subscription = pastDueSubscriptions.data[0]
        }
      }

      if (!subscription) {
        // Check if already canceled in our database
        if (profile.plan_tier === 'Canceled' || profile.plan_tier === 'None') {
          return NextResponse.json(
            { error: 'Your subscription is already canceled. No further action needed.' },
            { status: 400 }
          )
        }
        return NextResponse.json(
          { error: 'No active subscription found in Stripe. Please contact support.' },
          { status: 400 }
        )
      }

      // Self-heal: Update database if subscription ID is stale
      if (subscription.id !== profile.stripe_subscription_id) {
        console.log(`Self-healing subscription ID for cancel: ${profile.stripe_subscription_id} -> ${subscription.id}`)
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

    // Allow cancellation for active, trialing, and past_due subscriptions
    // past_due users should be able to cancel - they want to stop, let them
    const cancellableStatuses = ['active', 'trialing', 'past_due']
    if (!cancellableStatuses.includes(subscription.status)) {
      // Map Stripe status to user-friendly message
      const statusMessages: Record<string, string> = {
        'canceled': 'Your subscription is already canceled.',
        'incomplete': 'Your subscription payment is incomplete. Please update your payment method or contact support.',
        'incomplete_expired': 'Your subscription has expired due to incomplete payment.',
        'unpaid': 'Your subscription is unpaid and will be canceled automatically.',
        'paused': 'Your subscription is paused. Please contact support to cancel.',
      }
      return NextResponse.json(
        { error: statusMessages[subscription.status] || `Subscription cannot be canceled (status: ${subscription.status})` },
        { status: 400 }
      )
    }

    // Check if already scheduled for cancellation
    if (subscription.cancel_at_period_end) {
      const cancelDate = new Date((subscription as any).current_period_end * 1000)
      return NextResponse.json({
        success: true,
        message: `Subscription is already scheduled for cancellation on ${cancelDate.toLocaleDateString()}`,
        alreadyScheduled: true,
        effectiveDate: cancelDate.toISOString(),
      })
    }

    // Cancel subscription at period end (NOT immediate)
    await stripe.subscriptions.update(
      subscription.id,
      {
        cancel_at_period_end: true,
        metadata: {
          canceled_by: 'user',
          canceled_at: new Date().toISOString(),
          // No pending downgrade - this is a full cancellation to Free
          pending_downgrade_tier: '',
          pending_downgrade_price_id: '',
        }
      }
    )

    // Calculate when the cancellation will take effect
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

    // Store the pending cancellation in the database
    // User keeps current tier until subscription actually ends
    // Then they'll have login access but only see plan selection page
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        pending_plan_tier: 'Canceled',
        pending_plan_effective_date: effectiveDate.toISOString(),
        pending_plan_price_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('Error storing pending cancellation:', updateError)
    }

    // Send cancellation confirmation email to member
    try {
      const firstName = profile.first_name || profile.full_name?.split(' ')[0] || 'Member'
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-member-subscription-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          type: 'cancellation',
          memberEmail: profile.email,
          firstName,
          subscriptionEndDate: effectiveDate.toISOString(),
        }),
      })
    } catch (emailError) {
      console.error('Error sending member cancellation email:', emailError)
      // Don't fail the cancellation if email fails
    }

    console.log(`Subscription cancellation scheduled for user ${profile.email} (${profile.full_name}), effective ${effectiveDate.toISOString()}`)

    return NextResponse.json({
      success: true,
      message: `Your subscription will be cancelled on ${effectiveDate.toLocaleDateString()}. You'll retain access until then.`,
      effectiveDate: effectiveDate.toISOString(),
      currentPlan: profile.plan_tier,
    })

  } catch (error) {
    console.error('Cancel subscription error:', error)
    return NextResponse.json(
      { error: 'Failed to cancel subscription' },
      { status: 500 }
    )
  }
}

// DELETE - Undo a pending cancellation (reactivate)
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
      .select('plan_tier, pending_plan_tier, stripe_subscription_id, stripe_customer_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      )
    }

    if (!profile.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No payment account found. Please contact support.' },
        { status: 400 }
      )
    }

    // STRIPE IS SOURCE OF TRUTH: Fetch subscription with cancel_at_period_end by customer ID
    let subscription: Stripe.Subscription | null = null
    try {
      // Look for subscriptions that are scheduled for cancellation
      const subscriptions = await stripe.subscriptions.list({
        customer: profile.stripe_customer_id,
        limit: 5
      })

      // Find one with cancel_at_period_end = true
      subscription = subscriptions.data.find(sub => sub.cancel_at_period_end) || null

      if (!subscription) {
        return NextResponse.json(
          { error: 'No pending cancellation to undo' },
          { status: 400 }
        )
      }

      // Self-heal: Update database if subscription ID is stale
      if (subscription.id !== profile.stripe_subscription_id) {
        console.log(`Self-healing subscription ID for undo cancel: ${profile.stripe_subscription_id} -> ${subscription.id}`)
        await supabase
          .from('profiles')
          .update({
            stripe_subscription_id: subscription.id,
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

    // Remove the cancel_at_period_end flag
    await stripe.subscriptions.update(
      subscription.id,
      {
        cancel_at_period_end: false,
        metadata: {
          canceled_by: '',
          canceled_at: '',
          pending_downgrade_tier: '',
          pending_downgrade_price_id: '',
        }
      }
    )

    // Clear the pending cancellation from the database
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
      message: 'Cancellation undone. Your subscription will continue.',
      currentPlan: profile.plan_tier,
    })

  } catch (error) {
    console.error('Undo cancellation error:', error)
    return NextResponse.json(
      { error: 'Failed to undo cancellation' },
      { status: 500 }
    )
  }
}
