// Support Ticket Edge Function
// Handles submission of general support tickets

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
    if (!body.subject || !body.message) {
      return errorResponse('Missing required fields: subject, message', 400)
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
      .from('support_tickets')
      .insert({
        user_id: user.id,
        subject: body.subject,
        message: body.message,
        category: body.category || 'Other',
        priority: body.priority || 'normal',
        user_status: 'received',
        status: 'pending' // for backwards compatibility
      })
      .select()
      .single()

    if (insertError) {
      console.error('Insert error:', insertError)
      return errorResponse('Failed to save ticket', 500)
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
        message: 'Ticket saved but GHL sync failed - will retry automatically'
      }, 202)
    }

    // 7. Create GHL opportunity
    const ghlClient = getGHLClient()
    const opportunityName = profile.full_name

    try {
      const opportunityId = await ghlClient.createOpportunity({
        contactId: ghlContactId,
        pipelineId: Deno.env.get('GHL_PIPELINE_SUPPORT')!,
        stageId: Deno.env.get('GHL_STAGE_SUPPORT')!,
        name: opportunityName,
        source: 'AMP Portal',
        status: 'open',
        customFields: [
          { key: 'personal_nmls', field_value: profile.nmls_number || '' },
          { key: 'ticket_issue_type', field_value: body.category || 'Other' },
          { key: 'ticket_details', field_value: `${body.subject}\n\n${body.message}` },
          { key: 'preferred_contact_method', field_value: 'Email' },
          { key: 'submission_type', field_value: 'Support' }
        ]
      })

      console.log('Created GHL opportunity:', opportunityId)

      // 8. Update Supabase record with GHL IDs
      await supabase
        .from('support_tickets')
        .update({
          ghl_opportunity_id: opportunityId,
          ghl_contact_id: ghlContactId,
          user_status: 'pending',
          status: 'submitted_to_ghl',
        })
        .eq('id', submission.id)

      console.log('Updated submission with GHL IDs')

      return successResponse({
        id: submission.id,
        opportunityId,
        message: 'Support ticket submitted successfully'
      })

    } catch (ghlError) {
      console.error('GHL opportunity creation error:', ghlError)

      // Update submission with error
      await supabase
        .from('support_tickets')
        .update({
          user_status: 'failed',
        })
        .eq('id', submission.id)

      // Return partial success - data saved but GHL failed
      return successResponse({
        id: submission.id,
        message: 'Ticket saved but GHL sync failed - will be retried automatically'
      }, 202)
    }

  } catch (error) {
    console.error('Edge function error:', error)
    return errorResponse(error, 500)
  }
})
