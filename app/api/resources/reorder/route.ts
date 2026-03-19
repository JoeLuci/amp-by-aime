import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check if user is admin
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
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get the new order from request body
    const { orderedIds } = await request.json()

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json({ error: 'Invalid orderedIds array' }, { status: 400 })
    }

    // Update display_order for each resource
    const updates = orderedIds.map((id: string, index: number) =>
      supabase
        .from('resources')
        .update({ display_order: index + 1 })
        .eq('id', id)
    )

    const results = await Promise.all(updates)

    // Check for any errors - filter out null errors
    const errors = results.filter(r => r.error !== null && r.error !== undefined)
    if (errors.length > 0) {
      console.error('Errors updating display order:', errors.map(e => e.error))
      return NextResponse.json({ error: 'Failed to update some resources' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Display order updated' })
  } catch (error) {
    console.error('Error reordering resources:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
