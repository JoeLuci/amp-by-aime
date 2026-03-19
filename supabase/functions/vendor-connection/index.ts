// Vendor Connection Request Edge Function
// Handles submission of vendor connection requests

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
    if (!body.vendorId) {
      return errorResponse('Missing required field: vendorId', 400)
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

    // 4b. Fetch vendor details for company_name
    const { data: vendor, error: vendorError } = await supabase
      .from('vendors')
      .select('name, company_name')
      .eq('id', body.vendorId)
      .single()

    if (vendorError) {
      console.warn('Vendor fetch error (non-fatal):', vendorError)
    }

    // Use company_name if available, otherwise fallback to vendor name
    const vendorProduct = body.vendorName || vendor?.name || ''
    const vendorCompany = vendor?.company_name || vendorProduct

    // 5. Insert record to database (status: 'received')
    const { data: submission, error: insertError } = await supabase
      .from('vendor_connections')
      .insert({
        user_id: user.id,
        user_full_name: profile.full_name,
        user_email: profile.email,
        user_phone: profile.phone,
        user_nmls_number: profile.nmls_number,
        user_state_licenses: profile.state_licenses,
        vendor_id: body.vendorId,
        vendor_name: body.vendorName,
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
        pipelineId: Deno.env.get('GHL_PIPELINE_VENDOR_CONNECTION')!,
        stageId: Deno.env.get('GHL_STAGE_VENDOR_CONNECTION')!,
        name: opportunityName,
        source: 'AMP Portal',
        status: 'open',
        customFields: [
          { key: 'personal_nmls', field_value: profile.nmls_number || '' },
          { key: 'submission_type', field_value: 'Vendor Connection' },
          { key: 'vendor_product', field_value: vendorProduct },
          { key: 'vendor_company', field_value: vendorCompany },
          { key: 'membership_tier', field_value: profile.plan_tier || '' }
        ]
      })

      console.log('Created GHL opportunity:', opportunityId)

      // 8. Update Supabase record with GHL IDs
      await supabase
        .from('vendor_connections')
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
        message: 'Vendor connection request submitted successfully'
      })

    } catch (ghlError) {
      console.error('GHL opportunity creation error:', ghlError)

      // Update submission with error
      await supabase
        .from('vendor_connections')
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
