// Change AE Request Edge Function
// Handles submission of Change Account Executive requests

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
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

    // Validate required fields
    if (!body.lenderId || !body.issueType || !body.issueDescription) {
      return errorResponse('Missing required fields: lenderId, issueType, issueDescription', 400)
    }

    // 3. Create authenticated Supabase client
    const supabase = createAuthenticatedClient(authHeader!)

    // 4. Fetch user profile
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
    const { data: submission, error: insertError } = await supabase
      .from('change_ae_requests')
      .insert({
        user_id: user.id,
        user_full_name: profile.full_name,
        user_email: profile.email,
        user_phone: profile.phone,
        user_nmls_number: profile.nmls_number,
        user_state_licenses: profile.state_licenses,
        lender_id: body.lenderId,
        lender_name: body.lenderName,
        account_executive_name: body.accountExecutiveName,
        issue_type: body.issueType,
        issue_description: body.issueDescription,
        spoken_to_ae: body.spokenToAE || false,
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
        pipelineId: Deno.env.get('GHL_PIPELINE_CHANGE_AE')!,
        stageId: Deno.env.get('GHL_STAGE_CHANGE_AE')!,
        name: opportunityName,
        source: 'AMP Portal',
        status: 'open',
        customFields: [
          { key: 'personal_nmls', field_value: profile.nmls_number || '' },
          { key: 'state_licenses', field_value: profile.state_licenses?.join(', ') || '' },
          { key: 'lender', field_value: body.lenderName || '' },
          { key: 'ae_name', field_value: body.accountExecutiveName || '' },
          { key: 'issue_type', field_value: body.issueType || '' },
          { key: 'description', field_value: body.issueDescription || '' },
          { key: 'have_you_spoken_to_your_account_executive_about_the_above_issue', field_value: body.spokenToAE ? 'Yes' : 'No' },
          { key: 'last_spoken_to_ae_date', field_value: body.lastSpokenToAEDate || '' },
          { key: 'submission_type', field_value: 'Change AE' }
        ]
      })

      console.log('Created GHL opportunity:', opportunityId)

      // 8. Update Supabase record with GHL IDs
      await supabase
        .from('change_ae_requests')
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
        message: 'Change AE request submitted successfully'
      })

    } catch (ghlError) {
      console.error('GHL opportunity creation error:', ghlError)

      // Update submission with error
      await supabase
        .from('change_ae_requests')
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
