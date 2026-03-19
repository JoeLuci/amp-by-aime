import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'
import { getBasePlanEscalations } from '@/lib/escalations'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover',
})

// Map plan IDs to plan tier names for database
const PLAN_TIER_NAMES: Record<string, string> = {
  premium: 'Premium',
  elite: 'Elite',
  vip: 'VIP',
  processor_premium: 'Premium Processor',
  processor_elite: 'Elite Processor',
  processor_vip: 'VIP Processor',
  premium_guest: 'Premium Guest',
  processor_premium_guest: 'Premium Processor Guest',
}

// Price IDs for different plans
const PRICE_IDS: Record<string, string | undefined> = {
  // LO/Broker plans
  premium_monthly: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID,
  premium_annual: process.env.STRIPE_PREMIUM_ANNUAL_PRICE_ID,
  elite_monthly: process.env.STRIPE_ELITE_MONTHLY_PRICE_ID,
  elite_annual: process.env.STRIPE_ELITE_ANNUAL_PRICE_ID,
  vip_monthly: process.env.STRIPE_VIP_MONTHLY_PRICE_ID,
  vip_annual: process.env.STRIPE_VIP_ANNUAL_PRICE_ID,
  // Processor plans
  processor_premium_monthly: process.env.STRIPE_PROCESSOR_PREMIUM_MONTHLY_PRICE_ID,
  processor_premium_annual: process.env.STRIPE_PROCESSOR_PREMIUM_ANNUAL_PRICE_ID,
  processor_elite_monthly: process.env.STRIPE_PROCESSOR_ELITE_MONTHLY_PRICE_ID,
  processor_elite_annual: process.env.STRIPE_PROCESSOR_ELITE_ANNUAL_PRICE_ID,
  processor_vip_monthly: process.env.STRIPE_PROCESSOR_VIP_MONTHLY_PRICE_ID,
  processor_vip_annual: process.env.STRIPE_PROCESSOR_VIP_ANNUAL_PRICE_ID,
}

// Trial duration in days for Premium Guest
const TRIAL_DAYS = 90

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Check if user is admin
    const { data: { user: adminUser } } = await supabase.auth.getUser()
    if (!adminUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // TODO: Re-enable admin role check when roles are properly configured
    // const { data: adminProfile } = await supabase
    //   .from('profiles')
    //   .select('role')
    //   .eq('id', adminUser.id)
    //   .single()

    // const adminRoles = ['admin', 'super_admin', 'Broker Owner', 'Partner Lender', 'Partner Vendor']
    // if (!adminProfile || !adminRoles.includes(adminProfile.role)) {
    //   return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
    // }

    // Get request data
    const { userId, planId, billingInterval, couponCode, useExistingCard, billImmediately = true } = await request.json()

    if (!userId || !planId || !billingInterval) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Look up the Stripe coupon ID from the coupon code
    let stripeCouponId: string | null = null
    if (couponCode) {
      const { data: couponData, error: couponError } = await supabase
        .from('coupons')
        .select('stripe_coupon_id, is_active')
        .eq('code', couponCode.toUpperCase())
        .single()

      if (couponError || !couponData) {
        return NextResponse.json(
          { error: `Coupon code '${couponCode}' not found` },
          { status: 400 }
        )
      }

      if (!couponData.is_active) {
        return NextResponse.json(
          { error: `Coupon code '${couponCode}' is no longer active` },
          { status: 400 }
        )
      }

      if (!couponData.stripe_coupon_id) {
        return NextResponse.json(
          { error: `Coupon code '${couponCode}' is not synced with Stripe` },
          { status: 400 }
        )
      }

      stripeCouponId = couponData.stripe_coupon_id
    }

    // Get user profile
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('email, stripe_customer_id, stripe_subscription_id')
      .eq('id', userId)
      .single()

    if (!userProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if this is a trial (Premium Guest) request
    const isTrialPlan = planId === 'premium_guest' || planId === 'processor_premium_guest'

    // For Premium Guest, use Processor Premium price with 90 day trial
    // Regular Premium uses the standard Premium price
    const actualPlanId = isTrialPlan ? 'processor_premium' : planId
    const priceKey = `${actualPlanId}_${billingInterval}`
    const priceId = PRICE_IDS[priceKey]

    if (!priceId) {
      return NextResponse.json(
        { error: 'Invalid plan or billing interval' },
        { status: 400 }
      )
    }

    let customerId = userProfile.stripe_customer_id

    // Create Stripe customer if they don't have one
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userProfile.email,
        metadata: {
          supabase_user_id: userId,
        },
      })
      customerId = customer.id

      // Update profile with customer ID
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId)
    }

    // If user has an existing subscription, update it
    if (userProfile.stripe_subscription_id) {
      try {
        const subscription = await stripe.subscriptions.retrieve(
          userProfile.stripe_subscription_id
        )

        // Update the subscription to the new price
        // billImmediately: true = charge proration now, false = no proration (change applies but no immediate charge)
        const updatedSubscription = await stripe.subscriptions.update(userProfile.stripe_subscription_id, {
          items: [
            {
              id: subscription.items.data[0].id,
              price: priceId,
            },
          ],
          proration_behavior: billImmediately ? 'always_invoice' : 'none',
          ...(stripeCouponId && { discounts: [{ coupon: stripeCouponId }] }),
        })

        // Get the plan tier name for database
        const planTierName = PLAN_TIER_NAMES[planId] || planId

        // Update the database with new plan tier and subscription status
        const escalations = getBasePlanEscalations(planTierName)
        await supabase
          .from('profiles')
          .update({
            plan_tier: planTierName,
            stripe_subscription_id: updatedSubscription.id,
            stripe_subscription_status: updatedSubscription.status,
            subscription_status: updatedSubscription.status,
            escalations_remaining: escalations,
            escalations_last_reset_date: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId)

        return NextResponse.json({
          message: `Subscription updated to ${planTierName} successfully`,
        })
      } catch (error: any) {
        console.error('Error updating subscription:', error)
        // If subscription doesn't exist or is cancelled, create a new one via checkout
      }
    }

    // If useExistingCard is true, try to create subscription directly using saved payment method
    if (useExistingCard && customerId) {
      try {
        // Get customer's default payment method
        const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer
        const defaultPaymentMethod = customer.invoice_settings?.default_payment_method as string | undefined

        if (defaultPaymentMethod) {
          // Create subscription directly using the saved payment method
          const subscriptionParams: Stripe.SubscriptionCreateParams = {
            customer: customerId,
            items: [{ price: priceId }],
            default_payment_method: defaultPaymentMethod,
            payment_behavior: 'error_if_incomplete',
            metadata: {
              supabase_user_id: userId,
              admin_initiated: 'true',
              admin_user_id: adminUser.id,
            },
          }

          // Add trial period for Premium Guest
          if (isTrialPlan) {
            subscriptionParams.trial_period_days = TRIAL_DAYS
            subscriptionParams.metadata = {
              ...subscriptionParams.metadata,
              is_trial_plan: 'true',
            }
          }

          // Add coupon if provided
          if (stripeCouponId) {
            subscriptionParams.discounts = [{ coupon: stripeCouponId }]
          }

          const subscription = await stripe.subscriptions.create(subscriptionParams)

          // Get the plan tier name for database
          const planTierName = PLAN_TIER_NAMES[planId] || planId

          // Update user profile with subscription details and escalations
          const escalations = getBasePlanEscalations(planTierName)
          await supabase
            .from('profiles')
            .update({
              plan_tier: planTierName,
              stripe_subscription_id: subscription.id,
              stripe_subscription_status: subscription.status,
              subscription_status: subscription.status,
              escalations_remaining: escalations,
              escalations_last_reset_date: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', userId)

          return NextResponse.json({
            message: 'Subscription created successfully using saved card',
            subscriptionId: subscription.id,
          })
        }
        // If no default payment method, fall through to checkout
      } catch (error: any) {
        console.error('Error creating subscription with saved card:', error)
        // Fall through to checkout session
      }
    }

    // Get base URL from environment or construct from request headers
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
                    `${request.headers.get('x-forwarded-proto') || 'http'}://${request.headers.get('host')}`

    // Get the plan tier name for database
    const planTierName = PLAN_TIER_NAMES[planId] || planId

    // Create a new checkout session for the user
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/admin/users?upgraded=true&user=${userId}`,
      cancel_url: `${baseUrl}/admin/users?cancelled=true`,
      metadata: {
        supabase_user_id: userId,
        plan_tier: planTierName,
        admin_initiated: 'true',
        admin_user_id: adminUser.id,
        is_trial_plan: isTrialPlan ? 'true' : 'false',
      },
    }

    // Add trial period for Premium Guest (both LO and Processor)
    if (isTrialPlan) {
      sessionParams.subscription_data = {
        trial_period_days: TRIAL_DAYS,
        metadata: {
          is_trial_plan: 'true',
          supabase_user_id: userId,
          plan_tier: planTierName,
        },
      }
    }

    // Add coupon if provided
    if (stripeCouponId) {
      sessionParams.discounts = [{ coupon: stripeCouponId }]
    }

    const session = await stripe.checkout.sessions.create(sessionParams)

    if (!session.url) {
      return NextResponse.json(
        { error: 'Failed to create checkout session URL' },
        { status: 500 }
      )
    }

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('Error in admin upgrade:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process upgrade' },
      { status: 500 }
    )
  }
}
