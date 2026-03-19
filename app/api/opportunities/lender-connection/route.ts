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
    const { lender_id } = body

    if (!lender_id) {
      return NextResponse.json(
        { error: 'Lender ID is required' },
        { status: 400 }
      )
    }

    // Get lender details
    const { data: lender, error: lenderError } = await supabase
      .from('lenders')
      .select('id, name')
      .eq('id', lender_id)
      .single()

    if (lenderError || !lender) {
      return NextResponse.json(
        { error: 'Lender not found' },
        { status: 404 }
      )
    }

    // Create record in Supabase
    const { data: connection, error: insertError } = await supabase
      .from('lender_connections')
      .insert({
        user_id: user.id,
        lender_id: lender.id,
        lender_name: lender.name,
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
      console.error('Error inserting lender connection:', insertError)
      return NextResponse.json(
        { error: 'Failed to create connection request' },
        { status: 500 }
      )
    }

    // Track the connection as an analytics event
    await trackEventServer({
      userId: user.id,
      eventType: 'contact',
      contentType: 'lender',
      contentId: lender.id,
      contentTitle: lender.name,
      metadata: { connection_id: connection.id }
    })

    // Send to GHL
    const ghlResponse = await ghlClient.createOpportunityWithContact({
      type: 'lender_connection',
      contact: {
        fullName: profile.full_name,
        email: profile.email,
        phone: profile.phone || undefined,
        nmlsNumber: profile.nmls_number || undefined,
        stateLicenses: profile.state_licenses || undefined,
      },
      details: {
        lender_name: lender.name,
        lender_id: lender.id,
      },
    })

    // Update record with GHL IDs
    if (ghlResponse.success) {
      await supabase
        .from('lender_connections')
        .update({
          ghl_opportunity_id: ghlResponse.opportunityId,
          ghl_contact_id: ghlResponse.contactId,
          status: 'submitted_to_ghl',
          submitted_to_ghl_at: new Date().toISOString(),
        })
        .eq('id', connection.id)
    } else {
      await supabase
        .from('lender_connections')
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
    console.error('Error in lender-connection route:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
