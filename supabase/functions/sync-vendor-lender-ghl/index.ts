// Sync Vendor/Lender to GHL Edge Function
// Handles creating/updating GHL contacts when vendors/lenders are created or updated

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getGHLClient } from '@/_shared/ghl-client.ts'
import { successResponse, errorResponse, corsResponse } from '@/_shared/response.ts'

interface SyncRequest {
  user_id: string
  action: 'create' | 'update'
  // Primary user info
  first_name: string
  last_name: string
  email: string
  phone?: string
  role: 'partner_vendor' | 'partner_lender'
  company_name: string
  // Connections contact
  connections_contact_name: string
  connections_contact_email: string
  connections_contact_phone: string
  // Escalations contact (lenders only)
  escalations_contact_name?: string
  escalations_contact_email?: string
  escalations_contact_phone?: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return corsResponse()
  }

  const startTime = Date.now()
  console.log('=== sync-vendor-lender-ghl started ===')

  try {
    // Parse request body
    const body: SyncRequest = await req.json()
    console.log('Request:', {
      user_id: body.user_id,
      action: body.action,
      role: body.role,
      email: body.email,
      company_name: body.company_name
    })

    // Validate required fields
    if (!body.user_id || !body.email || !body.role || !body.company_name) {
      return errorResponse('Missing required fields', 400)
    }

    if (!body.connections_contact_name || !body.connections_contact_email || !body.connections_contact_phone) {
      return errorResponse('Missing connections contact information', 400)
    }

    if (body.role === 'partner_lender') {
      if (!body.escalations_contact_name || !body.escalations_contact_email || !body.escalations_contact_phone) {
        return errorResponse('Missing escalations contact information for lender', 400)
      }
    }

    // Initialize Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Initialize GHL client
    const ghlClient = getGHLClient()

    const results: Record<string, any> = {
      primary: null,
      connections: null,
      escalations: null
    }

    // 1. Sync primary vendor/lender contact
    console.log('Syncing primary contact...')
    try {
      const primaryContactId = await ghlClient.upsertContact({
        email: body.email,
        phone: body.phone,
        firstName: body.first_name,
        lastName: body.last_name,
        name: `${body.first_name} ${body.last_name}`,
        companyName: body.company_name, // Native GHL field, not custom
        customFields: {
          user_role: body.role,
          connections_contact_name: body.connections_contact_name,
          connections_contact_email: body.connections_contact_email,
          connections_contact_phone: body.connections_contact_phone,
          ...(body.role === 'partner_lender' && body.escalations_contact_name && {
            escalations_contact_name: body.escalations_contact_name,
            escalations_contact_email: body.escalations_contact_email,
            escalations_contact_phone: body.escalations_contact_phone
          })
        }
      })

      // Add tag based on role
      const roleTag = body.role === 'partner_vendor' ? 'vendor partner' : 'lender partner'
      await ghlClient.addTagsToContact(primaryContactId, [roleTag])

      results.primary = { contactId: primaryContactId, success: true }
      console.log('Primary contact synced:', primaryContactId)

      // Update profile with GHL contact ID
      await supabase
        .from('profiles')
        .update({ ghl_contact_id: primaryContactId })
        .eq('id', body.user_id)

    } catch (primaryError) {
      console.error('Error syncing primary contact:', primaryError)
      results.primary = { error: primaryError.message, success: false }
    }

    // 2. Sync connections contact
    console.log('Syncing connections contact...')
    try {
      const connectionsResult = await ghlClient.findOrCreateContactWithTag({
        name: body.connections_contact_name,
        email: body.connections_contact_email,
        phone: body.connections_contact_phone,
        companyName: body.company_name,
        tag: 'connections contact'
      })

      results.connections = {
        contactId: connectionsResult.contactId,
        isNew: connectionsResult.isNew,
        success: true
      }
      console.log('Connections contact synced:', connectionsResult.contactId, connectionsResult.isNew ? '(new)' : '(existing)')

      // Update profile with connections GHL contact ID
      await supabase
        .from('profiles')
        .update({ connections_ghl_contact_id: connectionsResult.contactId })
        .eq('id', body.user_id)

    } catch (connectionsError) {
      console.error('Error syncing connections contact:', connectionsError)
      results.connections = { error: connectionsError.message, success: false }
    }

    // 3. Sync escalations contact (lenders only)
    if (body.role === 'partner_lender' && body.escalations_contact_name) {
      console.log('Syncing escalations contact...')
      try {
        const escalationsResult = await ghlClient.findOrCreateContactWithTag({
          name: body.escalations_contact_name,
          email: body.escalations_contact_email!,
          phone: body.escalations_contact_phone!,
          companyName: body.company_name,
          tag: 'escalation contact'
        })

        results.escalations = {
          contactId: escalationsResult.contactId,
          isNew: escalationsResult.isNew,
          success: true
        }
        console.log('Escalations contact synced:', escalationsResult.contactId, escalationsResult.isNew ? '(new)' : '(existing)')

        // Update profile with escalations GHL contact ID
        await supabase
          .from('profiles')
          .update({ escalations_ghl_contact_id: escalationsResult.contactId })
          .eq('id', body.user_id)

      } catch (escalationsError) {
        console.error('Error syncing escalations contact:', escalationsError)
        results.escalations = { error: escalationsError.message, success: false }
      }
    }

    const duration = Date.now() - startTime
    console.log(`=== sync-vendor-lender-ghl completed in ${duration}ms ===`)
    console.log('Results:', results)

    // Determine overall success
    const allSuccessful = results.primary?.success &&
      results.connections?.success &&
      (body.role !== 'partner_lender' || results.escalations?.success)

    return successResponse({
      message: allSuccessful ? 'All contacts synced successfully' : 'Some contacts failed to sync',
      results,
      duration_ms: duration
    }, allSuccessful ? 200 : 207) // 207 Multi-Status for partial success

  } catch (error) {
    console.error('Edge function error:', error)
    return errorResponse(error, 500)
  }
})
