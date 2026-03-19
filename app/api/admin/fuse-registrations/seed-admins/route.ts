import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST - Create test registrations for all admin users in the active Fuse event
export async function POST() {
  try {
    const supabase = await createClient()

    // Verify caller is admin
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

    // Get active event
    const { data: activeEvent } = await supabase
      .from('fuse_events')
      .select('id, year, name')
      .eq('is_active', true)
      .single()

    if (!activeEvent) {
      return NextResponse.json({ error: 'No active Fuse event found' }, { status: 404 })
    }

    // Get all admin profiles
    const adminClient = createAdminClient()
    const { data: admins } = await adminClient
      .from('profiles')
      .select('id, email, full_name, phone, company, plan_tier')
      .eq('is_admin', true)

    if (!admins || admins.length === 0) {
      return NextResponse.json({ error: 'No admin users found' }, { status: 404 })
    }

    // Get existing registrations for this event to avoid duplicates
    const { data: existingRegs } = await adminClient
      .from('fuse_registrations')
      .select('user_id')
      .eq('fuse_event_id', activeEvent.id)

    const existingUserIds = new Set((existingRegs || []).map(r => r.user_id))

    // Create registrations for admins who don't already have one
    const toInsert = admins
      .filter(admin => !existingUserIds.has(admin.id))
      .map(admin => ({
        fuse_event_id: activeEvent.id,
        user_id: admin.id,
        full_name: admin.full_name || admin.email.split('@')[0],
        first_name: admin.full_name?.split(' ')[0] || admin.email.split('@')[0],
        last_name: admin.full_name?.split(' ').slice(1).join(' ') || '',
        email: admin.email,
        phone: admin.phone || '',
        company: admin.company || 'AIME (Admin Test)',
        gender: 'prefer_not_to_say',
        fuse_attendance: '0',
        ticket_type: 'general_admission',
        tier: ['Premium', 'Elite', 'VIP'].includes(admin.plan_tier || '') ? admin.plan_tier : null,
        purchase_type: 'claimed' as const,
        has_hall_of_aime: false,
        has_wmn_at_fuse: false,
        marketing_consent: false,
        registration_source: 'admin_manual',
        notes: 'Auto-generated admin test registration',
      }))

    if (toInsert.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All admins already have registrations',
        created: 0,
        total_admins: admins.length,
      })
    }

    const { data: created, error: insertError } = await adminClient
      .from('fuse_registrations')
      .insert(toInsert)
      .select('id')

    if (insertError) {
      console.error('Error seeding admin registrations:', insertError)
      return NextResponse.json(
        { error: 'Failed to create registrations: ' + insertError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Created ${created.length} test registrations for admin users`,
      created: created.length,
      total_admins: admins.length,
      skipped: admins.length - created.length,
    })
  } catch (error: any) {
    console.error('Error in seed-admins:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
