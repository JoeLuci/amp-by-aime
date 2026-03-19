import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET - Get a specific plan
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

    const { data: plan, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    }

    return NextResponse.json({ plan })
  } catch (error: any) {
    console.error('Error in GET /api/admin/subscriptions/plans/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH - Update a plan
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
    const {
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
    } = body

    // Build update object with only provided fields
    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (plan_tier !== undefined) updateData.plan_tier = plan_tier
    if (billing_period !== undefined) updateData.billing_period = billing_period
    if (price !== undefined) updateData.price = price
    if (currency !== undefined) updateData.currency = currency
    if (stripe_product_id !== undefined) updateData.stripe_product_id = stripe_product_id
    if (stripe_price_id !== undefined) updateData.stripe_price_id = stripe_price_id
    if (features !== undefined) updateData.features = features
    if (is_active !== undefined) updateData.is_active = is_active
    if (is_featured !== undefined) updateData.is_featured = is_featured
    if (sort_order !== undefined) updateData.sort_order = sort_order

    const { data: plan, error } = await supabase
      .from('subscription_plans')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating plan:', error)
      return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 })
    }

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    }

    return NextResponse.json({ plan })
  } catch (error: any) {
    console.error('Error in PATCH /api/admin/subscriptions/plans/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete a plan
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

    const { error } = await supabase
      .from('subscription_plans')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting plan:', error)
      return NextResponse.json({ error: 'Failed to delete plan' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Plan deleted successfully' })
  } catch (error: any) {
    console.error('Error in DELETE /api/admin/subscriptions/plans/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
