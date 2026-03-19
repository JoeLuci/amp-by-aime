import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover',
})

// POST - Create a checkout session for a user
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
    const {
      userEmail,
      planId,
      createAccount = false,
      applyTrial = false,
      notes,
      firstName,
      lastName,
    } = body

    if (!userEmail || !planId) {
      return NextResponse.json(
        { error: 'Missing required fields: userEmail, planId' },
        { status: 400 }
      )
    }

    // Get plan details
    const { data: plan, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', planId)
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
      .eq('email', userEmail)
      .single()

    let customerId = existingUser?.stripe_customer_id

    // Build customer name from provided first/last name
    const customerName = [firstName, lastName].filter(Boolean).join(' ').trim() || undefined

    // Create or get Stripe customer
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
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
        plan_id: planId,
        plan_tier: plan.plan_tier,
        admin_created: 'true',
        admin_user_id: user.id,
        admin_email: adminProfile.email,
        user_email: userEmail,
        create_account: createAccount ? 'true' : 'false',
        first_name: firstName || '',
        last_name: lastName || '',
      },
      expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
    }

    // If customer exists, use their ID; otherwise create new customer
    if (customerId) {
      sessionParams.customer = customerId
    } else {
      sessionParams.customer_creation = 'always'
      sessionParams.customer_email = userEmail
    }

    // Always allow promotion codes
    sessionParams.allow_promotion_codes = true

    // Apply 90-day trial if requested (for Premium Guest / Premium Processor Guest)
    if (applyTrial) {
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

    // Save to pending_checkouts table
    const { data: pendingCheckout, error: checkoutError } = await supabase
      .from('pending_checkouts')
      .insert({
        stripe_checkout_session_id: session.id,
        user_email: userEmail,
        user_id: existingUser?.id,
        plan_id: planId,
        plan_name: plan.name,
        plan_price: plan.price,
        billing_period: plan.billing_period,
        checkout_url: session.url,
        expires_at: new Date(session.expires_at * 1000).toISOString(),
        status: 'pending',
        created_by: user.id,
        created_by_email: adminProfile.email,
        notes,
        metadata: {
          create_account: createAccount,
          plan_tier: plan.plan_tier,
          first_name: firstName || null,
          last_name: lastName || null,
        },
      })
      .select()
      .single()

    if (checkoutError) {
      console.error('Error saving pending checkout:', checkoutError)
      // Don't fail the request, just log the error
    }

    return NextResponse.json({
      checkoutUrl: session.url,
      sessionId: session.id,
      expiresAt: new Date(session.expires_at * 1000).toISOString(),
      pendingCheckout,
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/admin/subscriptions/checkout:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}

// GET - List all pending checkouts
export async function GET(request: Request) {
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

    // Get query params
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const includeExpired = searchParams.get('includeExpired') === 'true'

    // Build query
    let query = supabase
      .from('pending_checkouts')
      .select('*')
      .order('created_at', { ascending: false })

    // Filter by status
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    // Exclude expired by default
    if (!includeExpired) {
      query = query.neq('status', 'expired')
    }

    const { data: checkouts, error } = await query

    if (error) {
      console.error('Error fetching pending checkouts:', error)
      return NextResponse.json({ error: 'Failed to fetch checkouts' }, { status: 500 })
    }

    return NextResponse.json({ checkouts })
  } catch (error: any) {
    console.error('Error in GET /api/admin/subscriptions/checkout:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
