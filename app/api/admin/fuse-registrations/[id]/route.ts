import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET - Get a single registration by ID
export async function GET(
  request: NextRequest,
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

    const { data: registration, error } = await supabase
      .from('fuse_registrations')
      .select(`
        *,
        fuse_event:fuse_event_id (id, name, year),
        user:user_id (id, email, full_name),
        guests:fuse_registration_guests (*)
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching registration:', error)
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
    }

    return NextResponse.json({ registration })
  } catch (error: any) {
    console.error('Error in GET /api/admin/fuse-registrations/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH - Update a registration
export async function PATCH(
  request: NextRequest,
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

    const body = await request.json()
    const { guests, ...updates } = body

    // Update the registration
    const { data: registration, error } = await supabase
      .from('fuse_registrations')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating registration:', error)
      return NextResponse.json({ error: 'Failed to update registration' }, { status: 500 })
    }

    // Handle guest updates if provided
    if (guests !== undefined) {
      // Delete existing guests
      await supabase
        .from('fuse_registration_guests')
        .delete()
        .eq('registration_id', id)

      // Insert new guests
      if (guests.length > 0) {
        const guestRecords = guests.map((guest: any) => ({
          registration_id: id,
          full_name: guest.full_name,
          email: guest.email || null,
          phone: guest.phone || null,
          ticket_type: guest.ticket_type,
          is_included: guest.is_included || false,
        }))

        await supabase
          .from('fuse_registration_guests')
          .insert(guestRecords)
      }
    }

    // Fetch the updated registration with relations
    const { data: fullRegistration } = await supabase
      .from('fuse_registrations')
      .select(`
        *,
        fuse_event:fuse_event_id (id, name, year),
        user:user_id (id, email, full_name),
        guests:fuse_registration_guests (*)
      `)
      .eq('id', id)
      .single()

    return NextResponse.json({ registration: fullRegistration })
  } catch (error: any) {
    console.error('Error in PATCH /api/admin/fuse-registrations/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete a registration
export async function DELETE(
  request: NextRequest,
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

    // Get the registration first to check if we need to reset the user's claimed year
    const { data: registration } = await supabase
      .from('fuse_registrations')
      .select('user_id, fuse_event_id, purchase_type')
      .eq('id', id)
      .single()

    if (!registration) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
    }

    // Delete the registration (guests will be cascade deleted)
    const { error } = await supabase
      .from('fuse_registrations')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting registration:', error)
      return NextResponse.json({ error: 'Failed to delete registration' }, { status: 500 })
    }

    // If this was a claimed ticket, reset the user's fuse_ticket_claimed_year
    if (registration.user_id && registration.purchase_type === 'claimed') {
      const { data: fuseEvent } = await supabase
        .from('fuse_events')
        .select('year')
        .eq('id', registration.fuse_event_id)
        .single()

      if (fuseEvent) {
        // Only reset if it matches the current year
        await supabase
          .from('profiles')
          .update({ fuse_ticket_claimed_year: null })
          .eq('id', registration.user_id)
          .eq('fuse_ticket_claimed_year', fuseEvent.year)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in DELETE /api/admin/fuse-registrations/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
