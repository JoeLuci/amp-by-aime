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
      partner_id,
      partner_type,
      loan_number,
      loan_type,
      loan_purpose,
      borrower_last_name,
      borrower_location,
      submission_date,
      closing_date,
      lock_expiration_date,
      account_executive_name,
      issue_type,
      issue_description,
      spoken_to_ae
    } = body

    if (!partner_id || !partner_type || !issue_type || !issue_description) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Get partner details (lender or vendor)
    let partnerName = ''
    let lenderId = null
    let vendorId = null

    if (partner_type === 'lender') {
      const { data: lender } = await supabase
        .from('lenders')
        .select('id, name')
        .eq('id', partner_id)
        .single()

      if (lender) {
        partnerName = lender.name
        lenderId = lender.id
      }
    } else if (partner_type === 'vendor') {
      const { data: vendor } = await supabase
        .from('vendors')
        .select('id, name')
        .eq('id', partner_id)
        .single()

      if (vendor) {
        partnerName = vendor.name
        vendorId = vendor.id
      }
    }

    if (!partnerName) {
      return NextResponse.json(
        { error: 'Partner not found' },
        { status: 404 }
      )
    }

    // Create record in Supabase
    const { data: escalation, error: insertError } = await supabase
      .from('loan_escalations')
      .insert({
        user_id: user.id,
        lender_id: lenderId,
        vendor_id: vendorId,
        partner_name: partnerName,
        partner_type,
        originator_full_name: profile.full_name,
        originator_email: profile.email,
        originator_phone: profile.phone,
        originator_nmls_number: profile.nmls_number,
        originator_state_licenses: profile.state_licenses,
        loan_number,
        loan_type,
        loan_purpose,
        borrower_last_name,
        borrower_location,
        submission_date,
        closing_date,
        lock_expiration_date,
        account_executive_name,
        issue_type,
        issue_description,
        spoken_to_ae,
        status: 'pending',
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error inserting loan escalation:', insertError)
      return NextResponse.json(
        { error: 'Failed to create escalation' },
        { status: 500 }
      )
    }

    // Send to GHL
    const ghlResponse = await ghlClient.createOpportunityWithContact({
      type: 'loan_escalation',
      contact: {
        fullName: profile.full_name,
        email: profile.email,
        phone: profile.phone || undefined,
        nmlsNumber: profile.nmls_number || undefined,
        stateLicenses: profile.state_licenses || undefined,
      },
      details: {
        partner_name: partnerName,
        partner_type,
        loan_number,
        loan_type,
        loan_purpose,
        borrower_last_name,
        borrower_location,
        submission_date,
        closing_date,
        lock_expiration_date,
        account_executive_name,
        issue_type,
        issue_description,
        spoken_to_ae,
      },
    })

    // Update record with GHL IDs
    if (ghlResponse.success) {
      await supabase
        .from('loan_escalations')
        .update({
          ghl_opportunity_id: ghlResponse.opportunityId,
          ghl_contact_id: ghlResponse.contactId,
          status: 'submitted_to_ghl',
          submitted_to_ghl_at: new Date().toISOString(),
        })
        .eq('id', escalation.id)
    } else {
      await supabase
        .from('loan_escalations')
        .update({
          status: 'failed',
          error_message: ghlResponse.error,
        })
        .eq('id', escalation.id)
    }

    return NextResponse.json({
      success: true,
      escalation_id: escalation.id,
      ghl_submitted: ghlResponse.success,
    })
  } catch (error) {
    console.error('Error in escalate-loan route:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
