import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ghlClient } from '@/lib/ghl/client'
import { trackEventServer } from '@/lib/analytics/track-event-server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, email, phone, nmls_number, state_licenses')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { vendor_id } = body

    if (!vendor_id) {
      return NextResponse.json(
        { error: 'Vendor ID is required' },
        { status: 400 }
      )
    }

    // Get vendor details
    const { data: vendor, error: vendorError } = await supabase
      .from('vendors')
      .select('id, name')
      .eq('id', vendor_id)
      .single()

    if (vendorError || !vendor) {
      return NextResponse.json(
        { error: 'Vendor not found' },
        { status: 404 }
      )
    }

    // Create record in Supabase
    const { data: connection, error: insertError } = await supabase
      .from('vendor_connections')
      .insert({
        user_id: user.id,
        vendor_id: vendor.id,
        vendor_name: vendor.name,
        user_full_name: profile.full_name,
        user_email: profile.email,
        user_phone: profile.phone,
        user_nmls_number: profile.nmls_number,
        user_state_licenses: profile.state_licenses,
        status: 'pending',
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error inserting vendor connection:', insertError)
      return NextResponse.json(
        { error: 'Failed to create connection request' },
        { status: 500 }
      )
    }

    // Track the connection as an analytics event
    await trackEventServer({
      userId: user.id,
      eventType: 'contact',
      contentType: 'vendor',
      contentId: vendor.id,
      contentTitle: vendor.name,
      metadata: { connection_id: connection.id }
    })

    // Send to GHL
    const ghlResponse = await ghlClient.createOpportunityWithContact({
      type: 'vendor_connection',
      contact: {
        fullName: profile.full_name,
        email: profile.email,
        phone: profile.phone || undefined,
        nmlsNumber: profile.nmls_number || undefined,
        stateLicenses: profile.state_licenses || undefined,
      },
      details: {
        vendor_name: vendor.name,
        vendor_id: vendor.id,
      },
    })

    // Update record with GHL IDs
    if (ghlResponse.success) {
      await supabase
        .from('vendor_connections')
        .update({
          ghl_opportunity_id: ghlResponse.opportunityId,
          ghl_contact_id: ghlResponse.contactId,
          status: 'submitted_to_ghl',
          submitted_to_ghl_at: new Date().toISOString(),
        })
        .eq('id', connection.id)
    } else {
      await supabase
        .from('vendor_connections')
        .update({
          status: 'failed',
          error_message: ghlResponse.error,
        })
        .eq('id', connection.id)
    }

    return NextResponse.json({
      success: true,
      connection_id: connection.id,
      ghl_submitted: ghlResponse.success,
    })
  } catch (error) {
    console.error('Error in vendor-connection route:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
