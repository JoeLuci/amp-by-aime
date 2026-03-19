import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover',
})

// GET - List all subscription plans
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
    const includeInactive = searchParams.get('includeInactive') === 'true'

    // Build query
    let query = supabase
      .from('subscription_plans')
      .select('*')
      .order('sort_order', { ascending: true })

    // Filter by active status if needed
    if (!includeInactive) {
      query = query.eq('is_active', true)
    }

    const { data: plans, error } = await query

    if (error) {
      console.error('Error fetching plans:', error)
      return NextResponse.json({ error: 'Failed to fetch plans' }, { status: 500 })
    }

    return NextResponse.json({ plans })
  } catch (error: any) {
    console.error('Error in GET /api/admin/subscriptions/plans:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create a new subscription plan
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

    const body = await request.json()
    const {
      name,
      description,
      plan_tier,
      billing_period,
      price,
      currency = 'usd',
      stripe_product_id,
      stripe_price_id,
      features = [],
      is_active = true,
      is_featured = false,
      sort_order = 0,
    } = body

    // Validate required fields
    if (!name || !plan_tier || !billing_period || price === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: name, plan_tier, billing_period, price' },
        { status: 400 }
      )
    }

    // Insert plan into database
    const { data: plan, error } = await supabase
      .from('subscription_plans')
      .insert({
        name,
        description,
        plan_tier,
        billing_period,
        price,
        currency,
        stripe_product_id,
        stripe_price_id,
        features,
        is_active,
        is_featured,
        sort_order,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating plan:', error)
      return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 })
    }

    return NextResponse.json({ plan }, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/admin/subscriptions/plans:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH - Sync plans from Stripe (Super Admins only)
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()

    // Check if user is authenticated and is super admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin, role')
      .eq('id', user.id)
      .single()

    if (!profile?.is_admin || profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Super Admin access required' }, { status: 403 })
    }

    // Fetch allowed Stripe Price IDs from database
    const { data: allowedPrices, error: allowedError } = await supabase
      .from('allowed_stripe_prices')
      .select('stripe_price_id, plan_name, plan_tier, billing_period')
      .eq('is_active', true)

    if (allowedError) {
      console.error('Error fetching allowed prices:', allowedError)
      return NextResponse.json({
        error: 'Failed to fetch allowed Stripe Price IDs',
      }, { status: 500 })
    }

    if (!allowedPrices || allowedPrices.length === 0) {
      return NextResponse.json({
        error: 'No allowed Stripe Price IDs configured. Add them in the database first.',
      }, { status: 400 })
    }

    const allowedPriceIds = allowedPrices.map(p => p.stripe_price_id)

    const syncedPlans = []
    const errors = []
    const skipped = []

    // Fetch only the allowed prices from Stripe
    for (const priceId of allowedPriceIds) {
      try {
        const price = await stripe.prices.retrieve(priceId as string, {
          expand: ['product'],
        })

        if (price.type !== 'recurring') {
          skipped.push({ price_id: priceId, reason: 'Not a recurring price' })
          continue
        }

        const product = price.product as Stripe.Product
        if (!product) {
          skipped.push({ price_id: priceId, reason: 'Product not found' })
          continue
        }

        // Get plan info from allowed_stripe_prices table
        const allowedPrice = allowedPrices.find(p => p.stripe_price_id === priceId)
        const planTier = allowedPrice?.plan_tier || (product.metadata.plan_tier as any) || 'Premium'
        const billingPeriod = allowedPrice?.billing_period || (price.recurring?.interval === 'year' ? 'annual' : 'monthly')

        // Check if plan already exists by stripe_price_id OR by plan_tier + billing_period
        let existingPlan = null

        // First try to find by stripe_price_id
        const { data: planByPriceId } = await supabase
          .from('subscription_plans')
          .select('id')
          .eq('stripe_price_id', price.id)
          .single()

        if (planByPriceId) {
          existingPlan = planByPriceId
        } else {
          // If not found, try to find by plan_tier + billing_period (for updating old plans)
          const { data: planByTier } = await supabase
            .from('subscription_plans')
            .select('id')
            .eq('plan_tier', planTier)
            .eq('billing_period', billingPeriod)
            .single()

          if (planByTier) {
            existingPlan = planByTier
          }
        }

        if (existingPlan) {
          // Update existing plan (including stripe_price_id if it was NULL)
          const { data, error } = await supabase
            .from('subscription_plans')
            .update({
              name: product.name,
              description: product.description || undefined,
              price: (price.unit_amount || 0) / 100,
              currency: price.currency,
              stripe_product_id: product.id,
              stripe_price_id: price.id, // Update this in case it was NULL
              is_active: price.active && product.active,
            })
            .eq('id', existingPlan.id)
            .select()
            .single()

          if (error) {
            errors.push({ price_id: price.id, error: error.message })
          } else {
            syncedPlans.push(data)
          }
        } else {
          // Create new plan
          const features = product.metadata.features
            ? JSON.parse(product.metadata.features)
            : []

          const { data, error } = await supabase
            .from('subscription_plans')
            .insert({
              name: product.name,
              description: product.description || undefined,
              plan_tier: planTier,
              billing_period: billingPeriod,
              price: (price.unit_amount || 0) / 100,
              currency: price.currency,
              stripe_product_id: product.id,
              stripe_price_id: price.id,
              features,
              is_active: price.active && product.active,
              created_by: user.id,
            })
            .select()
            .single()

          if (error) {
            errors.push({ price_id: price.id, error: error.message })
          } else {
            syncedPlans.push(data)
          }
        }
      } catch (err: any) {
        errors.push({ price_id: priceId, error: err.message })
      }
    }

    return NextResponse.json({
      message: 'Sync completed',
      synced: syncedPlans.length,
      skipped: skipped.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('Error in PATCH /api/admin/subscriptions/plans:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to sync plans' },
      { status: 500 }
    )
  }
}
