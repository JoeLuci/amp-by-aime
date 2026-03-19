import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH - Update checkout status (mark as sent, canceled, etc.)
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
    const { status, sentMethod, notes, userEmail, planId } = body

    const updateData: any = {}

    if (status) {
      updateData.status = status

      // If marking as sent, set sent_at timestamp
      if (status === 'sent' && sentMethod) {
        updateData.sent_at = new Date().toISOString()
        updateData.sent_method = sentMethod
      }
    }

    if (notes !== undefined) {
      updateData.notes = notes
    }

    if (userEmail) {
      updateData.user_email = userEmail
    }

    if (planId) {
      // Fetch plan details to update plan_name, plan_price, billing_period
      const { data: plan } = await supabase
        .from('subscription_plans')
        .select('id, name, price, billing_period')
        .eq('id', planId)
        .single()

      if (plan) {
        updateData.plan_id = planId
        updateData.plan_name = plan.name
        updateData.plan_price = plan.price
        updateData.billing_period = plan.billing_period
      }
    }

    const { data: checkout, error } = await supabase
      .from('pending_checkouts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating checkout:', error)
      return NextResponse.json({ error: 'Failed to update checkout' }, { status: 500 })
    }

    if (!checkout) {
      return NextResponse.json({ error: 'Checkout not found' }, { status: 404 })
    }

    return NextResponse.json({ checkout })
  } catch (error: any) {
    console.error('Error in PATCH /api/admin/subscriptions/checkout/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Permanently delete a pending checkout
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

    // Permanently delete the checkout record
    const { error } = await supabase
      .from('pending_checkouts')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting checkout:', error)
      return NextResponse.json({ error: 'Failed to delete checkout' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Checkout deleted successfully' })
  } catch (error: any) {
    console.error('Error in DELETE /api/admin/subscriptions/checkout/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
