import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover',
})

// POST - Resend/regenerate a checkout link
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Check if user is authenticated and is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('is_admin, email, full_name')
      .eq('id', user.id)
      .single()

    if (!adminProfile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { checkoutId, userEmail, planId, firstName, lastName } = body

    if (!checkoutId) {
      return NextResponse.json(
        { error: 'Missing required field: checkoutId' },
        { status: 400 }
      )
    }

    // Get the existing checkout
    const { data: existingCheckout, error: checkoutError } = await supabase
      .from('pending_checkouts')
      .select('*')
      .eq('id', checkoutId)
      .single()

    if (checkoutError || !existingCheckout) {
      return NextResponse.json({ error: 'Checkout not found' }, { status: 404 })
    }

    // Use provided values or fall back to existing checkout values
    const targetEmail = userEmail || existingCheckout.user_email
    const targetPlanId = planId || existingCheckout.plan_id

    // Get names from provided values or fall back to existing checkout metadata
    const targetFirstName = firstName || existingCheckout.metadata?.first_name || ''
    const targetLastName = lastName || existingCheckout.metadata?.last_name || ''

    // Get plan details
    const { data: plan, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', targetPlanId)
      .single()

    if (planError || !plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    }

    if (!plan.stripe_price_id) {
      return NextResponse.json(
        { error: 'Plan does not have a Stripe price ID' },
        { status: 400 }
      )
    }

    // Check if user exists
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id, email, stripe_customer_id, full_name')
      .eq('email', targetEmail)
      .single()

    let customerId = existingUser?.stripe_customer_id

    // Build customer name from provided first/last name
    const customerName = [targetFirstName, targetLastName].filter(Boolean).join(' ').trim() || undefined

    // Create or get Stripe customer
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: targetEmail,
        name: customerName,
        metadata: {
          supabase_user_id: existingUser?.id || '',
          created_by_admin: 'true',
          admin_email: adminProfile.email,
        },
      })
      customerId = customer.id

      // Update profile if user exists
      if (existingUser) {
        await supabase
          .from('profiles')
          .update({ stripe_customer_id: customerId })
          .eq('id', existingUser.id)
      }
    } else if (customerName) {
      // Update existing customer with name if provided
      await stripe.customers.update(customerId, { name: customerName })
    }

    // Get base URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
                    `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('host')}`

    // Check if trial was applied (from metadata)
    const applyTrial = existingCheckout.metadata?.create_account || false

    // Create checkout session
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      line_items: [
        {
          price: plan.stripe_price_id,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/dashboard?checkout=success`,
      cancel_url: `${baseUrl}/dashboard?checkout=canceled`,
      metadata: {
        plan_id: targetPlanId,
        plan_tier: plan.plan_tier,
        admin_created: 'true',
        admin_user_id: user.id,
        admin_email: adminProfile.email,
        user_email: targetEmail,
        resent_from: checkoutId,
        first_name: targetFirstName,
        last_name: targetLastName,
      },
      expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
    }

    // If customer exists, use their ID
    if (customerId) {
      sessionParams.customer = customerId
    } else {
      sessionParams.customer_creation = 'always'
      sessionParams.customer_email = targetEmail
    }

    // Always allow promotion codes
    sessionParams.allow_promotion_codes = true

    // Check metadata for trial setting
    if (existingCheckout.metadata?.is_guest === 'true' || existingCheckout.metadata?.trial_days) {
      sessionParams.subscription_data = {
        trial_period_days: 90,
        metadata: {
          is_guest: 'true',
          trial_days: '90',
        },
      }
    }

    const session = await stripe.checkout.sessions.create(sessionParams)

    if (!session.url) {
      return NextResponse.json(
        { error: 'Failed to create checkout session URL' },
        { status: 500 }
      )
    }

    // Update the existing pending_checkout record with new session info
    const { data: updatedCheckout, error: updateError } = await supabase
      .from('pending_checkouts')
      .update({
        stripe_checkout_session_id: session.id,
        checkout_url: session.url,
        expires_at: new Date(session.expires_at * 1000).toISOString(),
        status: 'pending',
        sent_at: null,
        sent_method: null,
        user_email: targetEmail,
        plan_id: targetPlanId,
        plan_name: plan.name,
        plan_price: plan.price,
        billing_period: plan.billing_period,
        metadata: {
          ...existingCheckout.metadata,
          plan_tier: plan.plan_tier,
          first_name: targetFirstName || null,
          last_name: targetLastName || null,
        },
      })
      .eq('id', checkoutId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating pending checkout:', updateError)
    }

    return NextResponse.json({
      checkoutUrl: session.url,
      sessionId: session.id,
      expiresAt: new Date(session.expires_at * 1000).toISOString(),
      checkout: updatedCheckout,
    })
  } catch (error: any) {
    console.error('Error in POST /api/admin/subscriptions/checkout/resend:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to resend checkout link' },
      { status: 500 }
    )
  }
}
