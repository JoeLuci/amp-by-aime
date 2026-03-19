import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    // Check if user is authenticated
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if current user is an admin
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', currentUser.id)
      .single()

    if (!currentProfile?.is_admin) {
      return NextResponse.json(
        { error: 'Only admins can access this endpoint' },
        { status: 403 }
      )
    }

    const {
      user_id,
      first_name,
      last_name,
      phone,
      company_name,
      connections_contact_name,
      connections_contact_email,
      connections_contact_phone,
      escalations_contact_name,
      escalations_contact_email,
      escalations_contact_phone,
    } = await request.json()

    if (!user_id) {
      return NextResponse.json(
        { error: 'Missing user_id' },
        { status: 400 }
      )
    }

    // Get the current profile to check role and existing GHL contact IDs
    const { data: existingProfile, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user_id)
      .single()

    if (fetchError || !existingProfile) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Validate role
    if (!['partner_vendor', 'partner_lender'].includes(existingProfile.role)) {
      return NextResponse.json(
        { error: 'This endpoint is only for vendor/lender accounts' },
        { status: 400 }
      )
    }

    // Build update object
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (first_name !== undefined) updateData.first_name = first_name
    if (last_name !== undefined) updateData.last_name = last_name
    if (first_name !== undefined || last_name !== undefined) {
      updateData.full_name = `${first_name || existingProfile.first_name || ''} ${last_name || existingProfile.last_name || ''}`.trim()
    }
    if (phone !== undefined) updateData.phone = phone
    if (company_name !== undefined) updateData.company_name = company_name

    // Handle Connections Contact change
    const connectionsChanged = (
      connections_contact_name !== undefined ||
      connections_contact_email !== undefined ||
      connections_contact_phone !== undefined
    ) && (
      connections_contact_name !== existingProfile.connections_contact_name ||
      connections_contact_email !== existingProfile.connections_contact_email ||
      connections_contact_phone !== existingProfile.connections_contact_phone
    )

    if (connections_contact_name !== undefined) updateData.connections_contact_name = connections_contact_name
    if (connections_contact_email !== undefined) updateData.connections_contact_email = connections_contact_email
    if (connections_contact_phone !== undefined) updateData.connections_contact_phone = connections_contact_phone

    // Handle Escalations Contact change (lenders only)
    const escalationsChanged = existingProfile.role === 'partner_lender' && (
      escalations_contact_name !== undefined ||
      escalations_contact_email !== undefined ||
      escalations_contact_phone !== undefined
    ) && (
      escalations_contact_name !== existingProfile.escalations_contact_name ||
      escalations_contact_email !== existingProfile.escalations_contact_email ||
      escalations_contact_phone !== existingProfile.escalations_contact_phone
    )

    if (existingProfile.role === 'partner_lender') {
      if (escalations_contact_name !== undefined) updateData.escalations_contact_name = escalations_contact_name
      if (escalations_contact_email !== undefined) updateData.escalations_contact_email = escalations_contact_email
      if (escalations_contact_phone !== undefined) updateData.escalations_contact_phone = escalations_contact_phone
    }

    // Update the profile
    const { data: updatedProfile, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', user_id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating profile:', updateError)
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      )
    }

    // Sync to GHL via Edge Function (fire-and-forget) if contacts changed
    if (connectionsChanged || escalationsChanged || first_name || last_name || phone || company_name) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

        if (supabaseUrl && supabaseAnonKey) {
          // Call edge function asynchronously (don't await)
          fetch(`${supabaseUrl}/functions/v1/sync-vendor-lender-ghl`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseAnonKey}`,
            },
            body: JSON.stringify({
              user_id,
              action: 'update',
              first_name: first_name || existingProfile.first_name,
              last_name: last_name || existingProfile.last_name,
              email: existingProfile.email,
              phone: phone || existingProfile.phone,
              role: existingProfile.role,
              company_name: company_name || existingProfile.company_name,
              connections_contact_name: connections_contact_name || existingProfile.connections_contact_name,
              connections_contact_email: connections_contact_email || existingProfile.connections_contact_email,
              connections_contact_phone: connections_contact_phone || existingProfile.connections_contact_phone,
              escalations_contact_name: existingProfile.role === 'partner_lender'
                ? (escalations_contact_name || existingProfile.escalations_contact_name)
                : undefined,
              escalations_contact_email: existingProfile.role === 'partner_lender'
                ? (escalations_contact_email || existingProfile.escalations_contact_email)
                : undefined,
              escalations_contact_phone: existingProfile.role === 'partner_lender'
                ? (escalations_contact_phone || existingProfile.escalations_contact_phone)
                : undefined,
            }),
          })
            .then(res => res.json())
            .then(data => console.log('GHL sync edge function response:', data))
            .catch(err => console.error('GHL sync edge function error:', err))

          console.log('GHL sync edge function triggered for user:', user_id)
        }
      } catch (ghlError) {
        console.error('Error triggering GHL sync edge function:', ghlError)
        // Don't fail the request
      }
    }

    return NextResponse.json({
      message: 'Vendor/Lender updated successfully',
      user: updatedProfile,
    })
  } catch (error: any) {
    console.error('Error in update-vendor-lender:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update vendor/lender' },
      { status: 500 }
    )
  }
}
