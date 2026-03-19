import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'
import { getBasePlanEscalations } from '@/lib/escalations'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover',
})

// GET - Fetch subscription details from Stripe
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    // Get user profile
    const { data: userProfile, error: userError } = await supabase
      .from('profiles')
      .select('id, email, stripe_subscription_id, stripe_customer_id, plan_tier, subscription_status')
      .eq('id', id)
      .single()

    if (userError || !userProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // If no Stripe subscription, check if customer has a saved payment method
    if (!userProfile.stripe_subscription_id) {
      let customerPaymentMethod = null

      // If customer exists, try to get their default payment method
      if (userProfile.stripe_customer_id) {
        try {
          const customer = await stripe.customers.retrieve(userProfile.stripe_customer_id) as Stripe.Customer
          const defaultPaymentMethodId = customer.invoice_settings?.default_payment_method as string | undefined

          if (defaultPaymentMethodId) {
            const pm = await stripe.paymentMethods.retrieve(defaultPaymentMethodId)
            if (pm.card) {
              customerPaymentMethod = {
                brand: pm.card.brand,
                last4: pm.card.last4,
                expMonth: pm.card.exp_month,
                expYear: pm.card.exp_year,
              }
            }
          }
        } catch (error) {
          console.error('Error fetching customer payment method:', error)
        }
      }

      return NextResponse.json({
        subscription: null,
        customerPaymentMethod,
        message: 'User does not have an active Stripe subscription',
      })
    }

    // Fetch subscription from Stripe with expanded data
    const subscription = await stripe.subscriptions.retrieve(
      userProfile.stripe_subscription_id,
      {
        expand: ['default_payment_method', 'discounts.coupon', 'items.data.price.product'],
      }
    )

    // Get the price details
    const priceItem = subscription.items.data[0]
    const price = priceItem?.price
    const product = price?.product as Stripe.Product | undefined

    // Calculate actual amount (with discount if applicable)
    let actualAmount = price?.unit_amount || 0
    let discountInfo = null

    // Get the first discount if available
    const discount = subscription.discounts?.[0] as any
    if (discount?.coupon) {
      const coupon = discount.coupon
      discountInfo = {
        code: discount.promotion_code
          ? (typeof discount.promotion_code === 'string'
              ? discount.promotion_code
              : discount.promotion_code.code)
          : coupon.name || coupon.id,
        percentOff: coupon.percent_off,
        amountOff: coupon.amount_off,
        duration: coupon.duration,
        durationInMonths: coupon.duration_in_months,
      }

      if (coupon.percent_off) {
        actualAmount = Math.round(actualAmount * (1 - coupon.percent_off / 100))
      } else if (coupon.amount_off) {
        actualAmount = Math.max(0, actualAmount - coupon.amount_off)
      }
    }

    // Get payment method details from subscription
    let paymentMethodDetails = null
    if (subscription.default_payment_method && typeof subscription.default_payment_method !== 'string') {
      const pm = subscription.default_payment_method as Stripe.PaymentMethod
      if (pm.card) {
        paymentMethodDetails = {
          brand: pm.card.brand,
          last4: pm.card.last4,
          expMonth: pm.card.exp_month,
          expYear: pm.card.exp_year,
        }
      }
    }

    // Also fetch customer's default payment method (may differ from subscription's)
    let customerPaymentMethod = null
    if (userProfile.stripe_customer_id) {
      try {
        const customer = await stripe.customers.retrieve(userProfile.stripe_customer_id) as Stripe.Customer
        const defaultPaymentMethodId = customer.invoice_settings?.default_payment_method as string | undefined

        if (defaultPaymentMethodId) {
          const pm = await stripe.paymentMethods.retrieve(defaultPaymentMethodId)
          if (pm.card) {
            customerPaymentMethod = {
              brand: pm.card.brand,
              last4: pm.card.last4,
              expMonth: pm.card.exp_month,
              expYear: pm.card.exp_year,
            }
          }
        }
      } catch (error) {
        console.error('Error fetching customer payment method:', error)
      }
    }

    // Safely get timestamps
    const currentPeriodStart = (subscription as any).current_period_start
    const currentPeriodEnd = (subscription as any).current_period_end

    return NextResponse.json({
      subscription: {
        id: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        currentPeriodStart: currentPeriodStart
          ? new Date(currentPeriodStart * 1000).toISOString()
          : null,
        currentPeriodEnd: currentPeriodEnd
          ? new Date(currentPeriodEnd * 1000).toISOString()
          : null,
        billingInterval: price?.recurring?.interval || 'unknown',
        planName: product?.name || userProfile.plan_tier || 'Unknown',
        listPrice: price?.unit_amount || 0,
        actualAmount,
        currency: price?.currency || 'usd',
        discount: discountInfo,
        paymentMethod: paymentMethodDetails,
        trialEnd: subscription.trial_end
          ? new Date(subscription.trial_end * 1000).toISOString()
          : null,
        canceledAt: subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000).toISOString()
          : null,
        metadata: subscription.metadata,
      },
      customerPaymentMethod,
    })
  } catch (error: any) {
    console.error('Error in GET /api/admin/subscriptions/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch subscription' },
      { status: 500 }
    )
  }
}

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

// PATCH - Update/Pause a subscription
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    const body = await request.json()
    const { action, planId, billingInterval, resumeDate } = body // action: 'pause', 'resume', 'change_plan', 'upgrade', 'downgrade'

    // Get user profile by id (params.id is the user_id)
    const { data: userProfile, error: userError } = await supabase
      .from('profiles')
      .select('id, email, stripe_subscription_id, plan_tier')
      .eq('id', id)
      .single()

    if (userError || !userProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!userProfile.stripe_subscription_id) {
      return NextResponse.json(
        { error: 'User does not have an active Stripe subscription' },
        { status: 400 }
      )
    }

    let subscription: Stripe.Subscription

    switch (action) {
      case 'pause':
        // Pause the subscription (pause collection)
        const pauseConfig: Stripe.SubscriptionUpdateParams['pause_collection'] = {
          behavior: 'mark_uncollectible',
        }

        // If a resume date is provided, set it
        // Append noon time to avoid timezone issues (date-only strings are parsed as UTC midnight)
        if (resumeDate) {
          const resumeTimestamp = Math.floor(new Date(resumeDate + 'T12:00:00').getTime() / 1000)
          pauseConfig.resumes_at = resumeTimestamp
        }

        subscription = await stripe.subscriptions.update(
          userProfile.stripe_subscription_id,
          {
            pause_collection: pauseConfig,
          }
        )

        await supabase
          .from('profiles')
          .update({
            subscription_status: 'paused',
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)

        break

      case 'resume':
        // Resume the subscription
        subscription = await stripe.subscriptions.update(
          userProfile.stripe_subscription_id,
          {
            pause_collection: null,
          }
        )

        await supabase
          .from('profiles')
          .update({ subscription_status: subscription.status })
          .eq('id', id)

        break

      case 'change_plan':
        if (!planId) {
          return NextResponse.json(
            { error: 'planId is required for change_plan action' },
            { status: 400 }
          )
        }

        // Get new plan details
        const { data: newPlan, error: planError } = await supabase
          .from('subscription_plans')
          .select('*')
          .eq('id', planId)
          .single()

        if (planError || !newPlan || !newPlan.stripe_price_id) {
          return NextResponse.json({ error: 'Plan not found or invalid' }, { status: 404 })
        }

        // Get current subscription from Stripe
        const currentSub = await stripe.subscriptions.retrieve(
          userProfile.stripe_subscription_id
        )

        // Update the subscription to the new price
        subscription = await stripe.subscriptions.update(
          userProfile.stripe_subscription_id,
          {
            items: [
              {
                id: currentSub.items.data[0].id,
                price: newPlan.stripe_price_id,
              },
            ],
            proration_behavior: 'always_invoice',
          }
        )

        await supabase
          .from('profiles')
          .update({
            plan_tier: newPlan.plan_tier,
            subscription_status: subscription.status,
          })
          .eq('id', id)

        break

      case 'upgrade':
        // Upgrade: immediate with proration, reset billing anchor, reset escalations
        if (!planId) {
          return NextResponse.json(
            { error: 'planId is required for upgrade action' },
            { status: 400 }
          )
        }

        // Get target plan
        const { data: upgradePlan, error: upgradePlanError } = await supabase
          .from('subscription_plans')
          .select('*')
          .eq('id', planId)
          .single()

        if (upgradePlanError || !upgradePlan?.stripe_price_id) {
          return NextResponse.json({ error: 'Plan not found or invalid' }, { status: 404 })
        }

        // Verify it's actually an upgrade
        const currentUpgradeTier = PLAN_HIERARCHY[userProfile.plan_tier || ''] ?? 0
        const targetUpgradeTier = PLAN_HIERARCHY[upgradePlan.plan_tier] ?? 0
        if (targetUpgradeTier <= currentUpgradeTier) {
          return NextResponse.json({ error: 'Target plan is not an upgrade' }, { status: 400 })
        }

        // Get current subscription
        const upgradeCurrentSub = await stripe.subscriptions.retrieve(
          userProfile.stripe_subscription_id
        )

        // Clear any pending downgrade
        if (upgradeCurrentSub.cancel_at_period_end) {
          await stripe.subscriptions.update(userProfile.stripe_subscription_id, {
            cancel_at_period_end: false,
            metadata: {
              pending_downgrade_tier: '',
              pending_downgrade_price_id: '',
              pending_downgrade_billing_interval: '',
            }
          })
        }

        // Upgrade with proration and reset billing anchor
        subscription = await stripe.subscriptions.update(
          userProfile.stripe_subscription_id,
          {
            items: [{
              id: upgradeCurrentSub.items.data[0].id,
              price: upgradePlan.stripe_price_id,
            }],
            proration_behavior: 'always_invoice',
            billing_cycle_anchor: 'now',
            metadata: { plan_tier: upgradePlan.plan_tier }
          }
        )

        // Update profile with new tier and reset escalations
        const upgradeEscalations = getBasePlanEscalations(upgradePlan.plan_tier)
        await supabase
          .from('profiles')
          .update({
            plan_tier: upgradePlan.plan_tier,
            stripe_subscription_status: subscription.status,
            escalations_remaining: upgradeEscalations,
            escalations_last_reset_date: new Date().toISOString(),
            pending_plan_tier: null,
            pending_plan_effective_date: null,
            pending_plan_price_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)

        break

      case 'sync_from_stripe':
        // Sync the database with actual Stripe subscription data
        // This fixes mismatches caused by webhook issues or manual Stripe changes
        const syncSub = await stripe.subscriptions.retrieve(
          userProfile.stripe_subscription_id,
          { expand: ['items.data.price'] }
        )

        const syncPriceId = syncSub.items.data[0]?.price?.id
        if (!syncPriceId) {
          return NextResponse.json({ error: 'Could not get price from Stripe subscription' }, { status: 400 })
        }

        // Look up the plan tier from the price ID
        const { data: syncPlan, error: syncPlanError } = await supabase
          .from('subscription_plans')
          .select('plan_tier')
          .eq('stripe_price_id', syncPriceId)
          .single()

        if (syncPlanError || !syncPlan) {
          return NextResponse.json({
            error: `Could not find plan for Stripe price ID: ${syncPriceId}. Please ensure this price is in subscription_plans table.`
          }, { status: 404 })
        }

        // Determine the correct tier - use actual subscription tier
        // Premium Guest is deprecated - users get their actual subscription tier
        const syncTier = syncPlan.plan_tier

        // Determine the correct status
        // If paused, keep as paused; otherwise use Stripe's status
        const isPaused = syncSub.pause_collection !== null
        const syncStatus = isPaused ? 'paused' : syncSub.status

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
            // Clear any override since we're syncing to actual Stripe data
            subscription_override: false,
            override_plan_tier: null,
            override_subscription_status: null,
            override_reason: null,
            override_set_by: null,
            override_set_at: null,
            override_expires_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)

        if (syncUpdateError) {
          console.error('Error syncing from Stripe:', syncUpdateError)
          return NextResponse.json({ error: 'Failed to update database' }, { status: 500 })
        }

        return NextResponse.json({
          message: `Synced from Stripe: ${syncTier} (${syncStatus})`,
          synced: {
            plan_tier: syncTier,
            status: syncStatus,
            stripe_status: syncSub.status,
            escalations: syncEscalations,
            price_id: syncPriceId,
          },
        })

      case 'downgrade':
        // Downgrade: schedule for end of billing period
        if (!planId) {
          return NextResponse.json(
            { error: 'planId is required for downgrade action' },
            { status: 400 }
          )
        }

        // Get target plan
        const { data: downgradePlan, error: downgradePlanError } = await supabase
          .from('subscription_plans')
          .select('*')
          .eq('id', planId)
          .single()

        if (downgradePlanError || !downgradePlan?.stripe_price_id) {
          return NextResponse.json({ error: 'Plan not found or invalid' }, { status: 404 })
        }

        // Verify it's actually a downgrade
        const currentDowngradeTier = PLAN_HIERARCHY[userProfile.plan_tier || ''] ?? 0
        const targetDowngradeTier = PLAN_HIERARCHY[downgradePlan.plan_tier] ?? 0
        if (targetDowngradeTier >= currentDowngradeTier) {
          return NextResponse.json({ error: 'Target plan is not a downgrade' }, { status: 400 })
        }

        // Get current subscription for period end
        const downgradeCurrentSub = await stripe.subscriptions.retrieve(
          userProfile.stripe_subscription_id
        )

        // Set cancel_at_period_end and store pending downgrade info
        subscription = await stripe.subscriptions.update(
          userProfile.stripe_subscription_id,
          {
            cancel_at_period_end: true,
            metadata: {
              pending_downgrade_tier: downgradePlan.plan_tier,
              pending_downgrade_price_id: downgradePlan.stripe_price_id,
              pending_downgrade_billing_interval: downgradePlan.billing_period || 'annual',
            }
          }
        )

        // Store pending downgrade in database
        const currentPeriodEnd = (downgradeCurrentSub as any).current_period_end as number
        const effectiveDate = new Date(currentPeriodEnd * 1000)

        await supabase
          .from('profiles')
          .update({
            pending_plan_tier: downgradePlan.plan_tier,
            pending_plan_effective_date: effectiveDate.toISOString(),
            pending_plan_price_id: downgradePlan.stripe_price_id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)

        return NextResponse.json({
          message: `Downgrade to ${downgradePlan.plan_tier} scheduled for ${effectiveDate.toLocaleDateString()}`,
          effectiveDate: effectiveDate.toISOString(),
          subscription: {
            id: subscription.id,
            status: subscription.status,
            cancel_at_period_end: true,
          },
        })

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const periodStart = (subscription as any).current_period_start
    const periodEnd = (subscription as any).current_period_end

    return NextResponse.json({
      message: `Subscription ${action} successful`,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      },
    })
  } catch (error: any) {
    console.error('Error in PATCH /api/admin/subscriptions/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update subscription' },
      { status: 500 }
    )
  }
}

// DELETE - Cancel a subscription
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    // Get query params
    const { searchParams } = new URL(request.url)
    const immediate = searchParams.get('immediate') === 'true'

    // Get user profile
    const { data: userProfile, error: userError } = await supabase
      .from('profiles')
      .select('id, stripe_subscription_id')
      .eq('id', id)
      .single()

    if (userError || !userProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!userProfile.stripe_subscription_id) {
      return NextResponse.json(
        { error: 'User does not have an active Stripe subscription' },
        { status: 400 }
      )
    }

    // Cancel the subscription in Stripe
    let subscription
    if (immediate) {
      // Cancel immediately
      subscription = await stripe.subscriptions.cancel(userProfile.stripe_subscription_id)

      // Update user profile - immediate cancellation
      await supabase
        .from('profiles')
        .update({
          subscription_status: 'canceled',
          plan_tier: 'Canceled',
          pending_plan_tier: null,
          pending_plan_effective_date: null,
          pending_plan_price_id: null,
          escalations_remaining: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
    } else {
      // Cancel at period end
      subscription = await stripe.subscriptions.update(
        userProfile.stripe_subscription_id,
        {
          cancel_at_period_end: true,
        }
      )

      // Get the period end date for the pending cancellation
      const currentPeriodEnd = (subscription as any).current_period_end as number
      const effectiveDate = new Date(currentPeriodEnd * 1000)

      // Update user profile with pending cancellation
      await supabase
        .from('profiles')
        .update({
          subscription_status: subscription.status,
          pending_plan_tier: 'Canceled',
          pending_plan_effective_date: effectiveDate.toISOString(),
          pending_plan_price_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
    }

    return NextResponse.json({
      message: immediate
        ? 'Subscription canceled immediately'
        : 'Subscription will be canceled at the end of the billing period',
      subscription: {
        id: subscription.id,
        status: subscription.status,
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000).toISOString()
          : null,
      },
    })
  } catch (error: any) {
    console.error('Error in DELETE /api/admin/subscriptions/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to cancel subscription' },
      { status: 500 }
    )
  }
}
