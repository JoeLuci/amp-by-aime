import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET - List all fuse events
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

    const { data: events, error } = await supabase
      .from('fuse_events')
      .select('*')
      .order('year', { ascending: false })

    if (error) {
      console.error('Error fetching fuse events:', error)
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
    }

    return NextResponse.json({ events })
  } catch (error: any) {
    console.error('Error in GET /api/admin/fuse-events:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create a new fuse event
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
      name,
      year,
      start_date,
      end_date,
      registration_open = false,
      claim_form_url,
      is_active = false,
    } = body

    // Validate required fields
    if (!name || !year) {
      return NextResponse.json(
        { error: 'Missing required fields: name, year' },
        { status: 400 }
      )
    }

    // Check if event for this year already exists
    const { data: existingEvent } = await supabase
      .from('fuse_events')
      .select('id')
      .eq('year', year)
      .single()

    if (existingEvent) {
      return NextResponse.json(
        { error: 'An event for this year already exists' },
        { status: 400 }
      )
    }

    // If setting as active, deactivate all other events first
    if (is_active) {
      await supabase
        .from('fuse_events')
        .update({ is_active: false })
        .eq('is_active', true)
    }

    const { data: event, error } = await supabase
      .from('fuse_events')
      .insert({
        name,
        year,
        start_date: start_date || null,
        end_date: end_date || null,
        registration_open,
        claim_form_url: claim_form_url || null,
        is_active,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating fuse event:', error)
      return NextResponse.json({ error: 'Failed to create event' }, { status: 500 })
    }

    return NextResponse.json({ event }, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/admin/fuse-events:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH - Update an existing fuse event
export async function PATCH(request: Request) {
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
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Missing event ID' },
        { status: 400 }
      )
    }

    // If setting as active, deactivate all other events first
    if (updates.is_active) {
      await supabase
        .from('fuse_events')
        .update({ is_active: false })
        .neq('id', id)
    }

    const { data: event, error } = await supabase
      .from('fuse_events')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating fuse event:', error)
      return NextResponse.json({ error: 'Failed to update event' }, { status: 500 })
    }

    return NextResponse.json({ event })
  } catch (error: any) {
    console.error('Error in PATCH /api/admin/fuse-events:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
