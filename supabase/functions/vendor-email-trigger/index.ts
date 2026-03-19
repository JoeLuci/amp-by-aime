// Vendor Email Trigger Edge Function
// Triggered when vendor connection reaches "Send Email" stage in GHL
// Sends email to vendor contact and updates status

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsResponse, successResponse, errorResponse } from '@/_shared/response.ts'
import { sendVendorEmail } from '@/_shared/email-sender.ts'
import { getGHLClient } from '@/_shared/ghl-client.ts'

interface WebhookPayload {
  type: string
  location_id: string
  opportunity_id: string
  contact_id: string
  pipeline_id: string
  pipeline_stage_id: string
  pipeline_stage_name: string
  status: string
  name: string
  [key: string]: any
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return corsResponse()
  }

  try {
    // Parse webhook payload
    const payload: WebhookPayload = await req.json()
    console.log('Received vendor webhook:', payload)

    // Only process vendor connection pipeline
    const PIPELINE_VENDOR_CONNECTION = Deno.env.get('GHL_PIPELINE_VENDOR_CONNECTION')
    if (payload.pipeline_id !== PIPELINE_VENDOR_CONNECTION) {
      console.log('Ignoring non-vendor-connection webhook')
      return successResponse({ message: 'Not a vendor connection' })
    }

    // Only process if moved to "Send Email" stage
    const STAGE_SEND_EMAIL = Deno.env.get('GHL_STAGE_VENDOR_SEND_EMAIL')
    if (!STAGE_SEND_EMAIL || payload.pipeline_stage_id !== STAGE_SEND_EMAIL) {
      console.log('Not in Send Email stage, ignoring')
      return successResponse({ message: 'Not in Send Email stage' })
    }

    // Create Supabase client with service role key
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Fetch vendor connection record
    const { data: vendorConnection, error: fetchError } = await supabase
      .from('vendor_connections')
      .select('*, vendors(name, contact_email, contact_name)')
      .eq('ghl_opportunity_id', payload.opportunity_id)
      .single()

    if (fetchError || !vendorConnection) {
      console.error('Error fetching vendor connection:', fetchError)
      return errorResponse('Vendor connection not found', 404)
    }

    // Check if email already sent
    if (vendorConnection.email_sent_to_vendor) {
      console.log('Email already sent for this vendor connection')
      return successResponse({ message: 'Email already sent' })
    }

    // Get vendor email details
    const vendor = vendorConnection.vendors
    if (!vendor || !vendor.contact_email) {
      console.error('Vendor contact email not found')

      // Update record with error
      await supabase
        .from('vendor_connections')
        .update({
          email_error: 'Vendor contact email not found',
          user_status: 'failed'
        })
        .eq('id', vendorConnection.id)

      return errorResponse('Vendor contact email not found', 400)
    }

    // Send email to vendor
    try {
      await sendVendorEmail({
        to: vendor.contact_email,
        vendorName: vendor.name,
        originatorName: vendorConnection.user_full_name,
        originatorEmail: vendorConnection.user_email,
        originatorPhone: vendorConnection.user_phone,
        originatorNMLS: vendorConnection.user_nmls_number,
        originatorStateLicenses: vendorConnection.user_state_licenses,
      })

      console.log('Email sent successfully to:', vendor.contact_email)

      // Update Supabase record
      await supabase
        .from('vendor_connections')
        .update({
          email_sent_to_vendor: true,
          email_sent_at: new Date().toISOString(),
          user_status: 'closed', // Auto-close on successful email
          email_error: null
        })
        .eq('id', vendorConnection.id)

      // Update GHL opportunity to "Closed" stage
      const ghlClient = getGHLClient()
      const STAGE_CLOSED = Deno.env.get('GHL_STAGE_VENDOR_CLOSED')

      if (STAGE_CLOSED) {
        try {
          await ghlClient.updateOpportunityStage(
            payload.opportunity_id,
            STAGE_CLOSED
          )
          console.log('Moved opportunity to Closed stage in GHL')
        } catch (ghlError) {
          console.error('Failed to update GHL stage:', ghlError)
          // Non-fatal - email was sent successfully
        }
      }

      return successResponse({
        message: 'Email sent successfully and opportunity closed',
        vendor_connection_id: vendorConnection.id
      })

    } catch (emailError) {
      console.error('Email send error:', emailError)

      // Update record with error
      await supabase
        .from('vendor_connections')
        .update({
          email_error: emailError.message || 'Failed to send email',
          user_status: 'failed'
        })
        .eq('id', vendorConnection.id)

      return errorResponse('Failed to send email: ' + emailError.message, 500)
    }

  } catch (error) {
    console.error('Webhook processing error:', error)
    return errorResponse(error, 500)
  }
})
