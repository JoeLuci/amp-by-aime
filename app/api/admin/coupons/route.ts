import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/config'
import type Stripe from 'stripe'

// GET - List all coupons
export async function GET() {
  try {
    const supabase = await createClient()

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

    const { data: coupons, error } = await supabase
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching coupons:', error)
      return NextResponse.json({ error: 'Failed to fetch coupons' }, { status: 500 })
    }

    return NextResponse.json({ coupons })
  } catch (error: any) {
    console.error('Error in GET /api/admin/coupons:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create a new coupon (creates in Stripe first, then saves to DB)
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

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
      code,
      description,
      discount_type,
      discount_value,
      duration = 'once',
      duration_in_months,
      max_uses,
      valid_from,
      valid_until,
      is_active = true,
    } = body

    // Validate required fields
    if (!code || !discount_type || discount_value === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: code, discount_type, discount_value' },
        { status: 400 }
      )
    }

    const couponCode = code.toUpperCase()

    // Check if coupon code already exists in database
    const { data: existingCoupon } = await supabase
      .from('coupons')
      .select('id')
      .eq('code', couponCode)
      .single()

    if (existingCoupon) {
      return NextResponse.json(
        { error: 'A coupon with this code already exists' },
        { status: 400 }
      )
    }

    // Create coupon in Stripe
    const stripeCouponParams: Stripe.CouponCreateParams = {
      name: description || couponCode,
      metadata: {
        code: couponCode,
        source: 'amp-admin-portal',
      },
    }

    // Set discount type
    if (discount_type === 'percentage') {
      stripeCouponParams.percent_off = discount_value
    } else {
      // Fixed amount - Stripe expects cents
      stripeCouponParams.amount_off = Math.round(discount_value * 100)
      stripeCouponParams.currency = 'usd'
    }

    // Set duration from form (matches Stripe's options)
    // Note: Stripe only allows 'forever' duration for percent_off coupons
    if (duration === 'forever' && discount_type !== 'percentage') {
      return NextResponse.json(
        { error: 'Forever duration is only allowed with percentage coupons' },
        { status: 400 }
      )
    }

    stripeCouponParams.duration = duration
    if (duration === 'repeating') {
      stripeCouponParams.duration_in_months = duration_in_months || 3
    }

    // Set redemption limit
    if (max_uses) {
      stripeCouponParams.max_redemptions = max_uses
    }

    // Set expiration
    if (valid_until) {
      stripeCouponParams.redeem_by = Math.floor(new Date(valid_until).getTime() / 1000)
    }

    const stripeCoupon = await stripe.coupons.create(stripeCouponParams)

    // Create promotion code in Stripe (the actual code users enter)
    // Make raw API call to avoid API version parameter issues
    const promoCodeResponse = await fetch('https://api.stripe.com/v1/promotion_codes', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        coupon: stripeCoupon.id,
        code: couponCode,
        active: is_active ? 'true' : 'false',
        'metadata[source]': 'amp-admin-portal',
        ...(max_uses ? { max_redemptions: max_uses.toString() } : {}),
      }).toString(),
    })

    if (!promoCodeResponse.ok) {
      const errorData = await promoCodeResponse.json()
      console.error('Stripe promotion code error:', errorData)
      // Clean up the coupon we just created
      try {
        await stripe.coupons.del(stripeCoupon.id)
      } catch (e) {
        console.error('Failed to cleanup coupon:', e)
      }
      throw new Error(errorData.error?.message || 'Failed to create promotion code')
    }

    const stripePromoCode = await promoCodeResponse.json()

    // Save to database with Stripe IDs
    const { data: coupon, error } = await supabase
      .from('coupons')
      .insert({
        code: couponCode,
        description,
        discount_type,
        discount_value,
        max_uses: max_uses || null,
        valid_from: valid_from || null,
        valid_until: valid_until || null,
        is_active,
        current_uses: 0,
        stripe_coupon_id: stripeCoupon.id,
        stripe_promotion_code_id: stripePromoCode.id,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Error saving coupon to database:', error)
      // Try to clean up Stripe resources
      try {
        await stripe.coupons.del(stripeCoupon.id)
      } catch (cleanupError) {
        console.error('Failed to cleanup Stripe coupon:', cleanupError)
      }
      return NextResponse.json({ error: 'Failed to save coupon' }, { status: 500 })
    }

    return NextResponse.json({
      coupon,
      stripe: {
        coupon_id: stripeCoupon.id,
        promotion_code_id: stripePromoCode.id,
      }
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/admin/coupons:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH - Sync coupons from Stripe
export async function PATCH() {
  try {
    const supabase = await createClient()

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

    const syncedCoupons = []
    const errors: { code: string; error: string }[] = []

    // Fetch all coupons from Stripe
    console.log('Fetching coupons from Stripe...')
    const stripeCoupons = await stripe.coupons.list({
      limit: 100,
    })
    console.log(`Found ${stripeCoupons.data.length} coupons in Stripe`)

    for (const stripeCoupon of stripeCoupons.data) {
      try {
        // Use coupon ID as the code (or name if available)
        const couponCode = (stripeCoupon.name || stripeCoupon.id).toUpperCase()

        // Check if already exists in database by stripe_coupon_id or code
        const { data: existingCoupon } = await supabase
          .from('coupons')
          .select('id')
          .or(`stripe_coupon_id.eq.${stripeCoupon.id},code.eq.${couponCode}`)
          .single()

        if (existingCoupon) {
          // Update existing coupon
          const { data, error } = await supabase
            .from('coupons')
            .update({
              code: couponCode,
              description: stripeCoupon.name || stripeCoupon.id,
              discount_type: stripeCoupon.percent_off ? 'percentage' : 'fixed',
              discount_value: stripeCoupon.percent_off || (stripeCoupon.amount_off ? stripeCoupon.amount_off / 100 : 0),
              max_uses: stripeCoupon.max_redemptions || null,
              valid_until: stripeCoupon.redeem_by ? new Date(stripeCoupon.redeem_by * 1000).toISOString() : null,
              is_active: stripeCoupon.valid,
              stripe_coupon_id: stripeCoupon.id,
            })
            .eq('id', existingCoupon.id)
            .select()
            .single()

          if (error) {
            errors.push({ code: couponCode, error: error.message })
          } else {
            syncedCoupons.push({ ...data, action: 'updated' })
          }
        } else {
          // Create new coupon
          const { data, error } = await supabase
            .from('coupons')
            .insert({
              code: couponCode,
              description: stripeCoupon.name || stripeCoupon.id,
              discount_type: stripeCoupon.percent_off ? 'percentage' : 'fixed',
              discount_value: stripeCoupon.percent_off || (stripeCoupon.amount_off ? stripeCoupon.amount_off / 100 : 0),
              max_uses: stripeCoupon.max_redemptions || null,
              valid_until: stripeCoupon.redeem_by ? new Date(stripeCoupon.redeem_by * 1000).toISOString() : null,
              is_active: stripeCoupon.valid,
              current_uses: stripeCoupon.times_redeemed || 0,
              stripe_coupon_id: stripeCoupon.id,
              created_by: user.id,
            })
            .select()
            .single()

          if (error) {
            errors.push({ code: couponCode, error: error.message })
          } else {
            syncedCoupons.push({ ...data, action: 'created' })
          }
        }
      } catch (err: any) {
        errors.push({ code: stripeCoupon.id, error: err.message })
      }
    }

    return NextResponse.json({
      message: 'Sync completed',
      stripe_coupons_found: stripeCoupons.data.length,
      synced: syncedCoupons.length,
      created: syncedCoupons.filter(c => c.action === 'created').length,
      updated: syncedCoupons.filter(c => c.action === 'updated').length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('Error in PATCH /api/admin/coupons:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to sync coupons' },
      { status: 500 }
    )
  }
}
