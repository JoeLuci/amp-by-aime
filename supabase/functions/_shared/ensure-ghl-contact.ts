// Ensure GHL Contact Exists (Race-Safe Implementation)
// Handles lazy contact creation with idempotent upserts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getGHLClient } from './ghl-client.ts'
import type { Profile } from './types.ts'

/**
 * Ensures a GHL contact exists for the given user
 * Returns the GHL contact ID (either from cache or newly created)
 *
 * This function is race-safe:
 * - Multiple concurrent calls will upsert to GHL (idempotent)
 * - Database update uses conditional WHERE clause
 * - Only first writer succeeds, others are no-ops
 * - All callers receive the same contact ID
 */
export async function ensureGHLContact(
  userId: string,
  supabaseClient: ReturnType<typeof createClient>
): Promise<string> {

  // Step 1: Fetch profile with current ghl_contact_id
  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (profileError || !profile) {
    throw new Error(`Profile not found for user ${userId}`)
  }

  // Step 2: If contact ID already exists, return it immediately (fast path)
  if (profile.ghl_contact_id) {
    console.log('GHL contact ID found in profile:', profile.ghl_contact_id)
    return profile.ghl_contact_id
  }

  console.log('GHL contact ID not found, creating contact...')

  // Step 3: Contact ID is NULL - upsert to GHL (idempotent operation)
  const ghlClient = getGHLClient()

  try {
    const contactId = await ghlClient.upsertContact({
      email: profile.email,
      phone: profile.phone,
      firstName: profile.first_name,
      lastName: profile.last_name,
      name: profile.full_name,
      customFields: [
        { key: 'nmls_number', field_value: profile.nmls_number || '' },
        { key: 'state_licenses', field_value: profile.state_licenses?.join(', ') || '' },
        { key: 'aime_membership_id', field_value: profile.id }
      ]
    })

    console.log('GHL contact created/found:', contactId)

    // Step 4: Attempt to store contact ID (race-safe update)
    // Only updates if ghl_contact_id is STILL null
    // If another process already stored it, this does nothing (that's OK!)
    const { error: updateError } = await supabaseClient
      .from('profiles')
      .update({ ghl_contact_id: contactId })
      .eq('id', userId)
      .is('ghl_contact_id', null)

    // Note: updateError is not critical - we have the contact ID either way
    if (updateError) {
      console.warn('Profile update race condition (expected):', updateError)
    }

    // Step 5: Return the contact ID (whether we stored it or someone else did)
    return contactId

  } catch (error) {
    console.error('Error ensuring GHL contact:', error)
    throw new Error(`Failed to create GHL contact: ${error.message}`)
  }
}
