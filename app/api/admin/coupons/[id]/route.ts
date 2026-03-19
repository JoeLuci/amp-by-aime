import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/config'

// GET - Get a single coupon
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    const { data: coupon, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !coupon) {
      return NextResponse.json({ error: 'Coupon not found' }, { status: 404 })
    }

    return NextResponse.json({ coupon })
  } catch (error: any) {
    console.error('Error in GET /api/admin/coupons/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH - Update a coupon
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    // Get existing coupon
    const { data: existingCoupon, error: fetchError } = await supabase
      .from('coupons')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !existingCoupon) {
      return NextResponse.json({ error: 'Coupon not found' }, { status: 404 })
    }

    const body = await request.json()
    const {
      description,
      is_active,
      max_uses,
      valid_from,
      valid_until,
    } = body

    // Update promotion code in Stripe if is_active changed
    if (existingCoupon.stripe_promotion_code_id && is_active !== undefined && is_active !== existingCoupon.is_active) {
      try {
        await stripe.promotionCodes.update(existingCoupon.stripe_promotion_code_id, {
          active: is_active,
        })
      } catch (stripeError: any) {
        console.error('Failed to update Stripe promotion code:', stripeError)
        // Continue with database update even if Stripe fails
      }
    }

    // Update coupon name in Stripe if description changed
    if (existingCoupon.stripe_coupon_id && description !== undefined && description !== existingCoupon.description) {
      try {
        await stripe.coupons.update(existingCoupon.stripe_coupon_id, {
          name: description || existingCoupon.code,
        })
      } catch (stripeError: any) {
        console.error('Failed to update Stripe coupon name:', stripeError)
        // Continue with database update even if Stripe fails
      }
    }

    // Build update object (only include fields that are being updated)
    const updateData: Record<string, any> = {}
    if (description !== undefined) updateData.description = description
    if (is_active !== undefined) updateData.is_active = is_active
    if (max_uses !== undefined) updateData.max_uses = max_uses || null
    if (valid_from !== undefined) updateData.valid_from = valid_from || null
    if (valid_until !== undefined) updateData.valid_until = valid_until || null

    // Update in database
    const { data: coupon, error } = await supabase
      .from('coupons')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating coupon:', error)
      return NextResponse.json({ error: 'Failed to update coupon' }, { status: 500 })
    }

    return NextResponse.json({ coupon })
  } catch (error: any) {
    console.error('Error in PATCH /api/admin/coupons/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete a coupon
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    // Get existing coupon to get Stripe IDs
    const { data: existingCoupon, error: fetchError } = await supabase
      .from('coupons')
      .select('stripe_coupon_id, stripe_promotion_code_id, code')
      .eq('id', id)
      .single()

    if (fetchError || !existingCoupon) {
      return NextResponse.json({ error: 'Coupon not found' }, { status: 404 })
    }

    // Deactivate promotion code in Stripe (can't delete, only deactivate)
    if (existingCoupon.stripe_promotion_code_id) {
      try {
        await stripe.promotionCodes.update(existingCoupon.stripe_promotion_code_id, {
          active: false,
        })
      } catch (stripeError: any) {
        console.error('Failed to deactivate Stripe promotion code:', stripeError)
        // Continue with deletion even if Stripe fails
      }
    }

    // Delete coupon from Stripe
    if (existingCoupon.stripe_coupon_id) {
      try {
        await stripe.coupons.del(existingCoupon.stripe_coupon_id)
      } catch (stripeError: any) {
        // Stripe may fail if coupon has been used - that's okay
        console.error('Failed to delete Stripe coupon (may have been used):', stripeError)
      }
    }

    // Delete from database
    const { error } = await supabase
      .from('coupons')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting coupon:', error)
      return NextResponse.json({ error: 'Failed to delete coupon' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: `Coupon "${existingCoupon.code}" deleted` })
  } catch (error: any) {
    console.error('Error in DELETE /api/admin/coupons/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
