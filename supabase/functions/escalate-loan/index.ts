// Escalate Loan Edge Function
// Handles submission of urgent loan escalation requests

import { authenticateUser, createAuthenticatedClient } from '../_shared/auth.ts'
import { ensureGHLContact } from '../_shared/ensure-ghl-contact.ts'
import { getGHLClient } from '../_shared/ghl-client.ts'
import { successResponse, errorResponse, corsResponse } from '../_shared/response.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return corsResponse()
  }

  try {
    // 1. Authenticate user
    const authHeader = req.headers.get('Authorization')
    const user = await authenticateUser(authHeader)
    console.log('Authenticated user:', user.id)

    // 2. Parse request body
    const body = await req.json()
    console.log('Request body:', body)

    // Validate required fields (match frontend validation)
    if (!body.issueType || !body.issueDescription) {
      return errorResponse('Missing required fields: issueType, issueDescription', 400)
    }

    // 3. Create authenticated Supabase client
    const supabase = createAuthenticatedClient(authHeader!)

    // 4. Fetch user profile (originator info)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('Profile fetch error:', profileError)
      return errorResponse('User profile not found', 404)
    }

    // 5. Insert record to database (status: 'received')
    const { data: submission, error: insertError} = await supabase
      .from('loan_escalations')
      .insert({
        user_id: user.id,
        originator_full_name: profile.full_name,
        originator_email: profile.email,
        originator_phone: profile.phone,
        originator_nmls_number: profile.nmls_number,
        originator_state_licenses: profile.state_licenses,

        // Partner info
        lender_id: body.lenderId,
        vendor_id: body.vendorId,
        partner_name: body.partnerName,
        partner_type: body.partnerType,

        // Loan details
        loan_number: body.loanNumber,
        loan_type: body.loanType,
        loan_purpose: body.loanPurpose,
        borrower_last_name: body.borrowerLastName,
        subject_property_state: body.subjectPropertyState,
        submission_date: body.submissionDate || null,
        closing_date: body.closingDate || null,
        lock_expiration_date: body.lockExpirationDate || null,

        // Issue details
        account_executive_name: body.accountExecutiveName,
        issue_type: body.issueType,
        issue_description: body.issueDescription,
        spoken_to_ae: body.spokenToAE || false,
        cr_number: body.crNumber || null,
        cr_date: body.crDate || null,

        user_status: 'received',
        status: 'pending' // for backwards compatibility
      })
      .select()
      .single()

    if (insertError) {
      console.error('Insert error:', insertError)
      return errorResponse('Failed to save request', 500)
    }

    console.log('Created submission:', submission.id)

    // 6. Ensure GHL contact exists (lazy creation, race-safe)
    let ghlContactId: string
    try {
      ghlContactId = await ensureGHLContact(user.id, supabase)
      console.log('GHL contact ensured:', ghlContactId)
    } catch (contactError) {
      console.error('GHL contact error:', contactError)
      // Non-fatal: record exists in Supabase, can retry GHL later
      return successResponse({
        id: submission.id,
        message: 'Request saved but GHL sync failed - will retry automatically'
      }, 202)
    }

    // 7. Create GHL opportunity
    const ghlClient = getGHLClient()
    const opportunityName = profile.full_name

    try {
      const opportunityId = await ghlClient.createOpportunity({
        contactId: ghlContactId,
        pipelineId: Deno.env.get('GHL_PIPELINE_LOAN_ESCALATION')!,
        stageId: Deno.env.get('GHL_STAGE_LOAN_ESCALATION')!,
        name: opportunityName,
        source: 'AMP Portal',
        status: 'open',
        customFields: [
          // Originator info
          { key: 'personal_nmls', field_value: profile.nmls_number || '' },
          { key: 'state_licenses', field_value: profile.state_licenses?.join(', ') || '' },

          // Partner info
          { key: 'lender', field_value: body.partnerName || '' },
          { key: 'partner_type', field_value: body.partnerType || '' },

          // Loan details
          { key: 'loan_number', field_value: body.loanNumber || '' },
          { key: 'loan_type', field_value: body.loanType || '' },
          { key: 'loan_purpose', field_value: body.loanPurpose || '' },
          { key: 'escalation_loan_amount', field_value: body.loanAmount ? parseFloat(body.loanAmount.replace(/[$,]/g, '')) : 0 },
          { key: 'borrower_last_name', field_value: body.borrowerLastName || '' },
          { key: 'subject_property_state', field_value: body.subjectPropertyState || '' },
          { key: 'loan_submission_date', field_value: body.submissionDate || '' },
          { key: 'loan_close_date', field_value: body.closingDate || '' },
          { key: 'lock_expiration_date', field_value: body.lockExpirationDate || '' },

          // Issue details
          { key: 'ae_name', field_value: body.accountExecutiveName || '' },
          { key: 'issue_type', field_value: body.issueType || '' },
          { key: 'description', field_value: body.issueDescription || '' },
          { key: 'have_you_spoken_to_your_account_executive_about_the_above_issue', field_value: body.spokenToAE ? 'Yes' : 'No' },
          { key: 'last_spoken_to_ae_date', field_value: body.lastSpokenToAEDate || '' },
          { key: 'cr_number', field_value: body.crNumber || '' },
          { key: 'cr_date', field_value: body.crDate || '' },

          // Broker info (same as originator/user profile)
          { key: 'broker_name', field_value: profile.full_name || '' },
          { key: 'broker_nmls', field_value: profile.nmls_number || '' },
          { key: 'broker_phone_number', field_value: profile.phone || '' },
          { key: 'broker_email', field_value: profile.email || '' },
          { key: 'submitter', field_value: profile.full_name || '' },

          { key: 'submission_type', field_value: 'Loan Escalation' }
        ]
      })

      console.log('Created GHL opportunity:', opportunityId)

      // 8. Update Supabase record with GHL IDs
      await supabase
        .from('loan_escalations')
        .update({
          ghl_opportunity_id: opportunityId,
          ghl_contact_id: ghlContactId,
          user_status: 'pending',
          status: 'submitted_to_ghl',
          submitted_to_ghl_at: new Date().toISOString()
        })
        .eq('id', submission.id)

      console.log('Updated submission with GHL IDs')

      return successResponse({
        id: submission.id,
        opportunityId,
        message: 'Loan escalation submitted successfully'
      })

    } catch (ghlError) {
      console.error('GHL opportunity creation error:', ghlError)

      // Update submission with error
      await supabase
        .from('loan_escalations')
        .update({
          user_status: 'failed',
          error_message: ghlError.message
        })
        .eq('id', submission.id)

      // Return partial success - data saved but GHL failed
      return successResponse({
        id: submission.id,
        message: 'Request saved but GHL sync failed - will be retried automatically'
      }, 202)
    }

  } catch (error) {
    console.error('Edge function error:', error)
    return errorResponse(error, 500)
  }
})
