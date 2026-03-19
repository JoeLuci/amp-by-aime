import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { FuseRegistration } from '@/types/database.types'

// GET - List all fuse registrations with filtering and pagination
export async function GET(request: NextRequest) {
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

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const eventId = searchParams.get('event_id')
    const search = searchParams.get('search')
    const ticketType = searchParams.get('ticket_type')
    const tier = searchParams.get('tier')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    // Build query
    let query = supabase
      .from('fuse_registrations')
      .select(`
        *,
        fuse_event:fuse_event_id (id, name, year),
        user:user_id (id, email, full_name),
        guests:fuse_registration_guests (*)
      `, { count: 'exact' })

    // Filter by event
    if (eventId) {
      query = query.eq('fuse_event_id', eventId)
    }

    // Search by name, email, or company
    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`)
    }

    // Filter by ticket type
    if (ticketType && ticketType !== 'all') {
      query = query.eq('ticket_type', ticketType)
    }

    // Filter by tier
    if (tier && tier !== 'all') {
      if (tier === 'public') {
        query = query.is('tier', null)
      } else {
        query = query.eq('tier', tier)
      }
    }

    // Add pagination and ordering
    const { data: registrations, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Error fetching registrations:', error)
      return NextResponse.json({ error: 'Failed to fetch registrations' }, { status: 500 })
    }

    return NextResponse.json({
      registrations,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: count ? Math.ceil(count / limit) : 0,
      }
    })
  } catch (error: any) {
    console.error('Error in GET /api/admin/fuse-registrations:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create a new registration (admin manual entry)
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
      fuse_event_id,
      full_name,
      email,
      phone,
      company,
      ticket_type,
      tier,
      purchase_type,
      has_hall_of_aime = false,
      has_wmn_at_fuse = false,
      notes,
      guests = [],
    } = body

    // Validate required fields
    if (!fuse_event_id || !full_name || !email || !ticket_type || !purchase_type) {
      return NextResponse.json(
        { error: 'Missing required fields: fuse_event_id, full_name, email, ticket_type, purchase_type' },
        { status: 400 }
      )
    }

    // Use explicit user_id if provided (from member picker), otherwise look up by email
    let memberProfile: { id: string; plan_tier: string | null } | null = null
    if (body.user_id) {
      const { data: mp } = await supabase
        .from('profiles')
        .select('id, plan_tier')
        .eq('id', body.user_id)
        .single()
      memberProfile = mp
    } else {
      const { data: mp } = await supabase
        .from('profiles')
        .select('id, plan_tier')
        .eq('email', email.toLowerCase())
        .single()
      memberProfile = mp
    }

    // Create registration
    const { data: registration, error } = await supabase
      .from('fuse_registrations')
      .insert({
        fuse_event_id,
        user_id: memberProfile?.id || null,
        full_name,
        email: email.toLowerCase(),
        phone: phone || null,
        company: company || null,
        ticket_type,
        tier: tier || null,
        purchase_type,
        has_hall_of_aime,
        has_wmn_at_fuse,
        registration_source: 'admin_manual',
        notes: notes || null,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating registration:', error)
      return NextResponse.json({ error: 'Failed to create registration' }, { status: 500 })
    }

    // Insert guests if any
    if (guests.length > 0) {
      const guestRecords = guests.map((guest: any) => ({
        registration_id: registration.id,
        full_name: guest.full_name,
        email: guest.email || null,
        phone: guest.phone || null,
        ticket_type: guest.ticket_type,
        is_included: guest.is_included || false,
      }))

      const { error: guestError } = await supabase
        .from('fuse_registration_guests')
        .insert(guestRecords)

      if (guestError) {
        console.error('Error creating guest records:', guestError)
        // Don't fail the entire request, just log the error
      }
    }

    // If member claimed, update their profile
    if (memberProfile && purchase_type === 'claimed') {
      const { data: fuseEvent } = await supabase
        .from('fuse_events')
        .select('year')
        .eq('id', fuse_event_id)
        .single()

      if (fuseEvent) {
        await supabase
          .from('profiles')
          .update({ fuse_ticket_claimed_year: fuseEvent.year })
          .eq('id', memberProfile.id)
      }
    }

    // Fetch the full registration with relations
    const { data: fullRegistration } = await supabase
      .from('fuse_registrations')
      .select(`
        *,
        fuse_event:fuse_event_id (id, name, year),
        user:user_id (id, email, full_name),
        guests:fuse_registration_guests (*)
      `)
      .eq('id', registration.id)
      .single()

    return NextResponse.json({ registration: fullRegistration }, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/admin/fuse-registrations:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
