import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ghlClient } from '@/lib/ghl/client'

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
    const {
      lender_id,
      account_executive_name,
      issue_type,
      issue_description,
      spoken_to_ae
    } = body

    if (!lender_id || !issue_type || !issue_description) {
      return NextResponse.json(
        { error: 'Missing required fields' },
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
    const { data: request_record, error: insertError } = await supabase
      .from('change_ae_requests')
      .insert({
        user_id: user.id,
        lender_id: lender.id,
        lender_name: lender.name,
        user_full_name: profile.full_name,
        user_email: profile.email,
        user_phone: profile.phone,
        user_nmls_number: profile.nmls_number,
        user_state_licenses: profile.state_licenses,
        account_executive_name,
        issue_type,
        issue_description,
        spoken_to_ae,
        status: 'pending',
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error inserting change AE request:', insertError)
      return NextResponse.json(
        { error: 'Failed to create request' },
        { status: 500 }
      )
    }

    // Send to GHL
    const ghlResponse = await ghlClient.createOpportunityWithContact({
      type: 'change_ae',
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
        account_executive_name,
        issue_type,
        issue_description,
        spoken_to_ae,
      },
    })

    // Update record with GHL IDs
    if (ghlResponse.success) {
      await supabase
        .from('change_ae_requests')
        .update({
          ghl_opportunity_id: ghlResponse.opportunityId,
          ghl_contact_id: ghlResponse.contactId,
          status: 'submitted_to_ghl',
          submitted_to_ghl_at: new Date().toISOString(),
        })
        .eq('id', request_record.id)
    } else {
      await supabase
        .from('change_ae_requests')
        .update({
          status: 'failed',
          error_message: ghlResponse.error,
        })
        .eq('id', request_record.id)
    }

    return NextResponse.json({
      success: true,
      request_id: request_record.id,
      ghl_submitted: ghlResponse.success,
    })
  } catch (error) {
    console.error('Error in change-ae route:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
