import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Use Private Integration Key (GHL_PRIVATE_KEY) for authentication
const GHL_API_KEY = Deno.env.get('GHL_PRIVATE_KEY') || Deno.env.get('GOHIGHLEVEL_API_KEY') || Deno.env.get('GHL_API_KEY') || ''
const GHL_API_URL = 'https://services.leadconnectorhq.com'
const GHL_LOCATION_ID = Deno.env.get('GHL_LOCATION_ID') || Deno.env.get('GOHIGHLEVEL_LOCATION_ID') || ''

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

interface ProfileRecord {
  id: string
  email: string
  full_name?: string
  first_name?: string
  last_name?: string
  phone?: string
  address?: string
  city?: string
  state?: string
  zip_code?: string
  company?: string
  company_nmls?: string
  birthday?: string
  role?: string
  nmls_number?: string
  state_licenses?: string[]
  race?: string
  gender?: string
  languages_spoken?: string[]
  bio?: string
  plan_tier?: string
  billing_period?: string
  payment_amount?: number
  scotsman_guide_subscription?: boolean
  scotsman_guide_subscription_date?: string
  stripe_customer_id?: string
  subscription_status?: string
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: ProfileRecord
  old_record?: ProfileRecord
}

// Retry-aware fetch wrapper for GHL API calls (handles 429 rate limits)
async function ghlFetch(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options)
    if (response.status !== 429 || attempt === maxRetries) {
      return response
    }
    // Exponential backoff: 1s, 2s, 4s
    const delay = Math.pow(2, attempt) * 1000
    console.warn(`GHL 429 rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
    await new Promise(resolve => setTimeout(resolve, delay))
  }
  // Unreachable, but TypeScript needs it
  throw new Error('Exceeded max retries')
}

// Find contact by field in GHL using search endpoint
async function findContactByField(field: string, value: string): Promise<string | null> {
  if (!value) return null
  try {
    const response = await ghlFetch(`${GHL_API_URL}/contacts/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GHL_API_KEY}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28',
      },
      body: JSON.stringify({
        locationId: GHL_LOCATION_ID,
        page: 1,
        pageLimit: 1,
        filters: [{
          group: 'OR',
          filters: [{ field, operator: 'eq', value }]
        }]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`GHL search by ${field} failed (${response.status}): ${errorText}`)
      return null
    }

    const data = await response.json()
    return data.contacts?.[0]?.id || null
  } catch (error) {
    console.error(`Error finding contact by ${field}:`, error)
    return null
  }
}

// Format date as YYYY-MM-DD
function formatDateYYYYMMDD(dateStr: string | undefined): string | null {
  if (!dateStr) return null
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return null
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  } catch {
    return null
  }
}

// Sync profile to GHL
async function syncProfileToGHL(profile: ProfileRecord): Promise<{ success: boolean; contactId?: string; error?: string }> {
  try {
    if (!GHL_API_KEY) {
      console.warn('GHL API not configured, skipping sync')
      return { success: true, contactId: 'mock_contact_id' }
    }

    // Parse name
    const nameParts = (profile.full_name || '').trim().split(' ')
    const firstName = profile.first_name || nameParts[0] || ''
    const lastName = profile.last_name || nameParts.slice(1).join(' ') || ''

    // Map role to display name
    const roleDisplayMap: Record<string, string> = {
      'loan_officer': 'Loan Officer',
      'broker_owner': 'Broker Owner',
      'loan_officer_assistant': 'Loan Officer Assistant',
      'processor': 'Processor',
    }
    const roleDisplay = roleDisplayMap[profile.role || ''] || profile.role || ''

    // Format arrays as comma-separated strings
    const stateLicenses = Array.isArray(profile.state_licenses)
      ? profile.state_licenses.join(', ')
      : ''
    const languagesSpoken = Array.isArray(profile.languages_spoken)
      ? profile.languages_spoken.join(', ')
      : ''

    // Build custom fields array (GHL requires array format with field keys)
    const customFields: { key: string; field_value: string }[] = []

    // Job Title (role)
    if (roleDisplay) customFields.push({ key: 'jobtitle', field_value: roleDisplay })
    // Gender
    if (profile.gender) customFields.push({ key: 'gender', field_value: profile.gender })
    // Race Type
    if (profile.race) customFields.push({ key: 'race_type', field_value: profile.race })
    // AIME Membership Tier
    if (profile.plan_tier) customFields.push({ key: 'aime_membership_tier', field_value: profile.plan_tier })
    // AIME Membership ID
    if (profile.id) customFields.push({ key: 'aime_membership_id', field_value: profile.id })
    // Membership Status
    if (profile.subscription_status) customFields.push({ key: 'membership_status', field_value: profile.subscription_status })
    // Payment Schedule (Monthly/Annual)
    if (profile.billing_period) customFields.push({ key: 'payment_schedule', field_value: profile.billing_period })
    // Payment Amount
    if (profile.payment_amount !== undefined && profile.payment_amount !== null) {
      customFields.push({ key: 'payment_amount', field_value: String(profile.payment_amount) })
    }
    // Stripe Id
    if (profile.stripe_customer_id) customFields.push({ key: 'stripe_id', field_value: profile.stripe_customer_id })
    // Brokerage NMLS
    if (profile.company_nmls) customFields.push({ key: 'brokerage_nmls', field_value: profile.company_nmls })
    // Brokerage State Licenses
    if (stateLicenses) customFields.push({ key: 'brokerage_state_licenses', field_value: stateLicenses })
    // Broker Owner?
    if (profile.role === 'broker_owner') customFields.push({ key: 'broker_owner', field_value: 'Yes' })
    // Business Name
    if (profile.company) customFields.push({ key: 'company_name', field_value: profile.company })
    // Scotsman Guide Subscription - only send "Opt-in" when true (GHL checkbox)
    if (profile.scotsman_guide_subscription === true) {
      customFields.push({ key: 'scotsman_guide_subscription', field_value: 'Opt-in' })
    }
    // Scotsman Guide Subscription Date - format as YYYY-MM-DD
    const formattedSubscriptionDate = formatDateYYYYMMDD(profile.scotsman_guide_subscription_date)
    if (formattedSubscriptionDate) {
      customFields.push({ key: 'scotsman_guide_subscription_date', field_value: formattedSubscriptionDate })
    }

    console.log('Custom fields being sent:', JSON.stringify(customFields))

    // Build payload
    const payload: Record<string, any> = {
      locationId: GHL_LOCATION_ID,
      firstName,
      lastName,
      name: profile.full_name || `${firstName} ${lastName}`.trim(),
      email: profile.email,
      phone: profile.phone,
      address1: profile.address,
      city: profile.city,
      state: profile.state,
      postalCode: profile.zip_code,
      companyName: profile.company,
      dateOfBirth: profile.birthday,
      customFields,
    }

    // Remove undefined/null/empty values from top level (keep customFields)
    Object.keys(payload).forEach(key => {
      if (key !== 'customFields' && (payload[key] === undefined || payload[key] === null || payload[key] === '')) {
        delete payload[key]
      }
    })

    // Find existing contact - search by email first, then by phone
    let existingContactId = await findContactByField('email', profile.email)
    if (!existingContactId && profile.phone) {
      existingContactId = await findContactByField('phone', profile.phone)
      if (existingContactId) {
        console.log(`Contact not found by email, but found by phone: ${existingContactId}`)
      }
    }

    let response: Response
    let contactId: string

    const ghlHeaders = {
      'Authorization': `Bearer ${GHL_API_KEY}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28',
    }

    // Helper to PUT-update a contact, retrying without phone if duplicate phone error
    async function updateContact(id: string, updatePayload: Record<string, any>): Promise<Response> {
      const resp = await ghlFetch(`${GHL_API_URL}/contacts/${id}`, {
        method: 'PUT',
        headers: ghlHeaders,
        body: JSON.stringify(updatePayload),
      })
      if (!resp.ok) {
        const errorText = await resp.text()
        try {
          const errorData = JSON.parse(errorText)
          // Duplicate phone belongs to another contact — retry without phone
          if (errorData.statusCode === 400 && errorData.meta?.matchingField === 'phone') {
            console.warn(`Duplicate phone conflict with ${errorData.meta.contactName} (${errorData.meta.contactId}), retrying without phone`)
            const { phone, ...payloadWithoutPhone } = updatePayload
            return ghlFetch(`${GHL_API_URL}/contacts/${id}`, {
              method: 'PUT',
              headers: ghlHeaders,
              body: JSON.stringify(payloadWithoutPhone),
            })
          }
        } catch { /* not JSON, fall through */ }
        // Return a synthetic response with the error body already consumed
        return new Response(errorText, { status: resp.status, statusText: resp.statusText, headers: resp.headers })
      }
      return resp
    }

    if (existingContactId) {
      // Update existing contact (remove locationId - not allowed on PUT)
      const { locationId, ...updatePayload } = payload
      response = await updateContact(existingContactId, updatePayload)
      contactId = existingContactId
      console.log(`Updating existing GHL contact: ${existingContactId}`)
    } else {
      // Create new contact
      response = await ghlFetch(`${GHL_API_URL}/contacts/`, {
        method: 'POST',
        headers: ghlHeaders,
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorText = await response.text()
        // Handle duplicate contact error - GHL gives us the existing contactId
        try {
          const errorData = JSON.parse(errorText)
          if (errorData.meta?.contactId) {
            contactId = errorData.meta.contactId
            console.log(`Duplicate found by ${errorData.meta.matchingField}, updating: ${contactId}`)
            const { locationId, ...updatePayload } = payload
            response = await updateContact(contactId, updatePayload)
            if (!response.ok) {
              const updateError = await response.text()
              throw new Error(`Failed to update contact: ${updateError}`)
            }
          } else {
            throw new Error(`Failed to create contact: ${errorText}`)
          }
        } catch (e) {
          if (e instanceof SyntaxError) {
            throw new Error(`Failed to create contact: ${errorText}`)
          }
          throw e
        }
      } else {
        const data = await response.json()
        contactId = data.contact?.id || data.id
        console.log(`Created new GHL contact: ${contactId}`)
      }
    }

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to sync contact: ${error}`)
    }

    console.log(`GHL profile synced for ${profile.email}, contactId: ${contactId}`)

    return { success: true, contactId }
  } catch (error) {
    console.error('Error syncing profile to GHL:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

Deno.serve(async (req) => {
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      })
    }

    const payload: WebhookPayload = await req.json()

    console.log(`Received ${payload.type} event for profiles table`)

    // Only process INSERT and UPDATE
    if (payload.type === 'DELETE') {
      return new Response(
        JSON.stringify({ message: 'DELETE events not processed' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const profile = payload.record

    // Skip if no email (required for GHL)
    if (!profile.email) {
      console.log('Skipping sync: no email address')
      return new Response(
        JSON.stringify({ message: 'Skipped: no email' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Sync to GHL
    const result = await syncProfileToGHL(profile)

    if (!result.success) {
      console.error('GHL sync failed:', result.error)
      // Return 200 to acknowledge receipt (don't retry on GHL failures)
      return new Response(
        JSON.stringify({ success: false, error: result.error }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Store the GHL contact ID back to the profile
    if (result.contactId && result.contactId !== 'mock_contact_id') {
      const supabase = createClient(supabaseUrl, supabaseServiceKey)
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ ghl_contact_id: result.contactId })
        .eq('id', profile.id)

      if (updateError) {
        console.error(`Failed to store ghl_contact_id for ${profile.email}:`, updateError.message)
      } else {
        console.log(`Stored ghl_contact_id ${result.contactId} for ${profile.email}`)
      }
    }

    return new Response(
      JSON.stringify({ success: true, contactId: result.contactId }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
