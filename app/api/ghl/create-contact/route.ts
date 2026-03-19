import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ghlClient } from '@/lib/ghl/client'

// Use service role for server-side operations
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, email, fullName, phone, role, nmlsNumber, companyName } = body

    if (!userId || !email) {
      return NextResponse.json(
        { error: 'userId and email are required' },
        { status: 400 }
      )
    }

    // Parse full name into first/last
    const nameParts = (fullName || '').trim().split(' ')
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''

    // Create/update contact in GHL
    const ghlResult = await ghlClient.upsertContact({
      firstName,
      lastName,
      email,
      phone,
      companyName,
      role,
      customFields: {
        ...(nmlsNumber && { nmls_number: nmlsNumber }),
        aime_user_id: userId,
        signup_source: 'amp_portal',
      },
    })

    if (!ghlResult.success) {
      console.error('GHL contact creation failed:', ghlResult.error)
      // Don't fail the request - log and continue
      return NextResponse.json({
        success: false,
        error: ghlResult.error,
        message: 'GHL contact creation failed but signup will proceed'
      })
    }

    // Store GHL contact ID in profile (race-safe update)
    if (ghlResult.contactId && ghlResult.contactId !== 'mock_contact_id') {
      const supabase = getSupabaseAdmin()

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ ghl_contact_id: ghlResult.contactId })
        .eq('id', userId)
        .is('ghl_contact_id', null) // Only update if not already set

      if (updateError) {
        console.warn('Profile GHL update failed (may be race condition):', updateError)
      }
    }

    return NextResponse.json({
      success: true,
      contactId: ghlResult.contactId,
    })
  } catch (error) {
    console.error('Error in GHL create-contact API:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'GHL contact creation failed but signup will proceed'
      },
      { status: 200 } // Return 200 to not block signup flow
    )
  }
}
