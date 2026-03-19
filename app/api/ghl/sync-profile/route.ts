import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ghlClient } from '@/lib/ghl/client'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get full profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Parse name
    const nameParts = (profile.full_name || '').trim().split(' ')
    const firstName = profile.first_name || nameParts[0] || ''
    const lastName = profile.last_name || nameParts.slice(1).join(' ') || ''

    // Format state licenses as comma-separated string
    const stateLicenses = Array.isArray(profile.state_licenses)
      ? profile.state_licenses.join(', ')
      : profile.state_licenses || ''

    // Format languages as comma-separated string
    const languagesSpoken = Array.isArray(profile.languages_spoken)
      ? profile.languages_spoken.join(', ')
      : profile.languages_spoken || ''

    // Map role to display name
    const roleDisplayMap: Record<string, string> = {
      'loan_officer': 'Loan Officer',
      'broker_owner': 'Broker Owner',
      'loan_officer_assistant': 'Loan Officer Assistant',
      'processor': 'Processor',
    }
    const roleDisplay = roleDisplayMap[profile.role] || profile.role || ''

    // Sync to GHL
    const result = await ghlClient.syncFullProfile({
      // Standard fields
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

      // Custom fields
      customFields: {
        role: roleDisplay,
        nmls: profile.nmls_number || '',
        state_licenses: stateLicenses,
        race_type: profile.race || '',
        gender: profile.gender || '',
        languages_spoken: languagesSpoken,
        biography: profile.bio || '',
        brokerage_nmls: profile.company_nmls || '',
        type: 'AIME Member',
        aime_membership_tier: profile.plan_tier || 'None',
        aime_membership_id: user.id,
        scotsman_guide_optin: profile.scotsman_guide_subscription ? 'Opt-in' : 'Opt-out',
        scotsman_guide_subscription_date: profile.scotsman_guide_subscription
          ? new Date().toISOString().split('T')[0]
          : '',
        stripe_id: profile.stripe_customer_id || '',
        subscription_status: profile.subscription_status || '',
      },
    })

    if (!result.success) {
      console.error('GHL sync failed:', result.error)
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      contactId: result.contactId,
    })
  } catch (error) {
    console.error('Error syncing profile to GHL:', error)
    return NextResponse.json(
      { error: 'Failed to sync profile' },
      { status: 500 }
    )
  }
}
