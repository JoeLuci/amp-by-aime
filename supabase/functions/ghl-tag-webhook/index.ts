// GHL Tag Webhook Edge Function
// Receives tag added/removed events from GoHighLevel and syncs contact data to Supabase
// Used for syncing vendor/lender connection contacts created manually in GHL

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsResponse, successResponse, errorResponse } from '../_shared/response.ts'

// GHL webhook payload for contact tag events
interface GHLTagWebhookPayload {
  type?: string // 'ContactTagUpdate' or similar
  locationId?: string
  location_id?: string
  contactId?: string
  contact_id?: string
  id?: string // Sometimes contact ID is just 'id'
  tags?: string[]
  tag?: string // Single tag that was added/removed
  action?: 'add' | 'remove' | string
  firstName?: string
  first_name?: string
  lastName?: string
  last_name?: string
  email?: string
  phone?: string
  companyName?: string
  company_name?: string
  customFields?: Record<string, any>
  custom_fields?: Record<string, any>
  [key: string]: any
}

// Tags that identify vendor connection contacts
const VENDOR_CONNECTION_TAGS = [
  'vendor-connection-contact',
  'vendor connection contact',
  'amp vendor contact',
]

// Tags that identify lender connection contacts
const LENDER_CONNECTION_TAGS = [
  'lender-connection-contact',
  'lender connection contact',
  'amp lender contact',
]

function normalizeTag(tag: string): string {
  return tag.toLowerCase().trim()
}

function isVendorConnectionTag(tag: string): boolean {
  const normalized = normalizeTag(tag)
  return VENDOR_CONNECTION_TAGS.some(t => normalizeTag(t) === normalized || normalized.includes(normalizeTag(t)))
}

function isLenderConnectionTag(tag: string): boolean {
  const normalized = normalizeTag(tag)
  return LENDER_CONNECTION_TAGS.some(t => normalizeTag(t) === normalized || normalized.includes(normalizeTag(t)))
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return corsResponse()
  }

  try {
    const payload: GHLTagWebhookPayload = await req.json()
    console.log('Received GHL tag webhook:', JSON.stringify(payload, null, 2))

    // Extract contact info (handle different GHL payload formats)
    const contactId = payload.contactId || payload.contact_id || payload.id
    const firstName = payload.firstName || payload.first_name || ''
    const lastName = payload.lastName || payload.last_name || ''
    const email = payload.email || ''
    const phone = payload.phone || ''
    const companyName = payload.companyName || payload.company_name || ''

    // Get the tag(s) - could be single tag or array
    const tags: string[] = []
    if (payload.tag) {
      tags.push(payload.tag)
    }
    if (payload.tags && Array.isArray(payload.tags)) {
      tags.push(...payload.tags)
    }

    // Determine action (add or remove)
    const action = payload.action?.toLowerCase() || 'add'

    if (!contactId) {
      console.error('Missing contact ID in webhook payload')
      return errorResponse('Missing contact ID', 400)
    }

    if (tags.length === 0) {
      console.log('No tags in payload, nothing to process')
      return successResponse({ message: 'No tags to process' })
    }

    // Check if any tags are vendor or lender connection tags
    const isVendorContact = tags.some(isVendorConnectionTag)
    const isLenderContact = tags.some(isLenderConnectionTag)

    if (!isVendorContact && !isLenderContact) {
      console.log('Tags do not match vendor/lender connection patterns:', tags)
      return successResponse({ message: 'Tags not relevant to connection contacts', tags })
    }

    // Create Supabase client with service role key (bypasses RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Build the contact name
    const contactName = [firstName, lastName].filter(Boolean).join(' ') || email || 'Unknown'

    // Determine the role to search for
    const targetRole = isLenderContact ? 'partner_lender' : 'partner_vendor'

    // Find the vendor/lender profile by company name
    if (!companyName) {
      console.error('No company name in payload - cannot match to vendor/lender profile')
      return errorResponse('Company name required to match contact to vendor/lender', 400)
    }

    // Look up the vendor/lender profile by company name
    const { data: profile, error: lookupError } = await supabase
      .from('profiles')
      .select('id, company_name, role')
      .eq('role', targetRole)
      .ilike('company_name', companyName)
      .single()

    if (lookupError || !profile) {
      console.log(`No ${targetRole} profile found for company: ${companyName}`)

      // Try a fuzzy match
      const { data: fuzzyMatch } = await supabase
        .from('profiles')
        .select('id, company_name, role')
        .eq('role', targetRole)
        .ilike('company_name', `%${companyName}%`)
        .limit(1)
        .single()

      if (!fuzzyMatch) {
        return errorResponse(`No ${targetRole} profile found for company: ${companyName}`, 404)
      }

      console.log(`Found fuzzy match: ${fuzzyMatch.company_name}`)
    }

    const targetProfile = profile || await supabase
      .from('profiles')
      .select('id, company_name, role')
      .eq('role', targetRole)
      .ilike('company_name', `%${companyName}%`)
      .limit(1)
      .single()
      .then(r => r.data)

    if (!targetProfile) {
      return errorResponse(`No ${targetRole} profile found for company: ${companyName}`, 404)
    }

    // Update the profile with connection contact info
    if (action === 'remove') {
      // Clear the connection contact fields
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          connections_contact_name: null,
          connections_contact_email: null,
          connections_contact_phone: null,
          connections_contact_ghl_id: null,
        })
        .eq('id', targetProfile.id)

      if (updateError) {
        console.error('Error clearing connection contact:', updateError)
        return errorResponse('Failed to clear connection contact', 500)
      }

      console.log(`Cleared connection contact for ${targetRole}: ${targetProfile.company_name}`)
      return successResponse({
        message: 'Connection contact cleared',
        profile_id: targetProfile.id,
        company: targetProfile.company_name,
        action: 'removed'
      })
    } else {
      // Add/update the connection contact fields
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          connections_contact_name: contactName,
          connections_contact_email: email || null,
          connections_contact_phone: phone || null,
          connections_contact_ghl_id: contactId,
        })
        .eq('id', targetProfile.id)

      if (updateError) {
        console.error('Error updating connection contact:', updateError)
        return errorResponse('Failed to update connection contact', 500)
      }

      console.log(`Updated connection contact for ${targetRole}: ${targetProfile.company_name}`)
      return successResponse({
        message: 'Connection contact synced',
        profile_id: targetProfile.id,
        company: targetProfile.company_name,
        contact: {
          name: contactName,
          email,
          phone,
          ghl_id: contactId
        },
        action: 'added'
      })
    }

  } catch (error) {
    console.error('Webhook processing error:', error)
    return errorResponse(error instanceof Error ? error : String(error), 500)
  }
})
