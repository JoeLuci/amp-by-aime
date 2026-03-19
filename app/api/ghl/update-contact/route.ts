import { NextRequest, NextResponse } from 'next/server'
import { ghlClient } from '@/lib/ghl/client'

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { contactId, email, fullName, phone, role, nmlsNumber, companyName, planTier, subscriptionStatus } = body

    if (!contactId) {
      return NextResponse.json(
        { error: 'contactId is required' },
        { status: 400 }
      )
    }

    // Parse full name into first/last
    const nameParts = (fullName || '').trim().split(' ')
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''

    // Build custom fields
    const customFields: Record<string, string> = {}
    if (nmlsNumber) {
      customFields.nmls_number = nmlsNumber
    }
    if (planTier) {
      customFields.subscription_tier = planTier
    }
    if (subscriptionStatus) {
      customFields.subscription_status = subscriptionStatus
    }

    // Update contact in GHL
    const ghlResult = await ghlClient.updateContact(contactId, {
      firstName,
      lastName,
      email,
      phone,
      companyName,
      role,
      customFields,
    })

    if (!ghlResult.success) {
      console.error('GHL contact update failed:', ghlResult.error)
      return NextResponse.json({
        success: false,
        error: ghlResult.error,
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      contactId: ghlResult.contactId,
    })
  } catch (error) {
    console.error('Error in GHL update-contact API:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
