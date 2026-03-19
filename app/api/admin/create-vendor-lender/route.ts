import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
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

    // Get request data
    const {
      first_name,
      last_name,
      email,
      phone,
      role,
      company_name,
      escalations_contact_name,
      escalations_contact_email,
      escalations_contact_phone,
    } = await request.json()

    if (!first_name || !last_name || !email || !role || !company_name) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate escalations contact for lenders
    if (role === 'partner_lender') {
      if (!escalations_contact_name || !escalations_contact_email || !escalations_contact_phone) {
        return NextResponse.json(
          { error: 'Missing Escalations Contact information for lenders' },
          { status: 400 }
        )
      }
    }

    // Validate role
    if (!['partner_vendor', 'partner_lender'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be partner_vendor or partner_lender' },
        { status: 400 }
      )
    }

    // Create the vendor/lender user using Supabase Admin API with invite
    // This sends an email for them to set their own password
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          first_name,
          last_name,
          full_name: `${first_name} ${last_name}`,
          phone,
          role, // Required for database trigger to set role on profile
        },
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
      }
    )

    if (createError) {
      console.error('Error inviting user:', createError)
      return NextResponse.json(
        { error: createError.message || 'Failed to create vendor/lender user' },
        { status: 500 }
      )
    }

    if (!newUser.user) {
      return NextResponse.json(
        { error: 'Failed to create vendor/lender user' },
        { status: 500 }
      )
    }

    // Update the profile with vendor/lender role and contact information
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        role,
        first_name,
        last_name,
        full_name: `${first_name} ${last_name}`,
        phone,
        company_name,
        escalations_contact_name: role === 'partner_lender' ? escalations_contact_name : null,
        escalations_contact_email: role === 'partner_lender' ? escalations_contact_email : null,
        escalations_contact_phone: role === 'partner_lender' ? escalations_contact_phone : null,
      })
      .eq('id', newUser.user.id)

    if (profileError) {
      console.error('Error updating profile:', profileError)
      // Try to delete the created user if profile update fails
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
      return NextResponse.json(
        { error: 'Failed to set vendor/lender role' },
        { status: 500 }
      )
    }

    // Sync vendor/lender to GoHighLevel via Edge Function (fire-and-forget)
    // This runs asynchronously and won't block the response
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
            user_id: newUser.user.id,
            action: 'create',
            first_name,
            last_name,
            email,
            phone,
            role,
            company_name,
            escalations_contact_name: role === 'partner_lender' ? escalations_contact_name : undefined,
            escalations_contact_email: role === 'partner_lender' ? escalations_contact_email : undefined,
            escalations_contact_phone: role === 'partner_lender' ? escalations_contact_phone : undefined,
          }),
        })
          .then(res => res.json())
          .then(data => console.log('GHL sync edge function response:', data))
          .catch(err => console.error('GHL sync edge function error:', err))

        console.log('GHL sync edge function triggered for user:', newUser.user.id)
      } else {
        console.warn('Supabase URL/Key not configured, skipping GHL sync')
      }
    } catch (ghlError) {
      console.error('Error triggering GHL sync edge function:', ghlError)
      // Don't fail the request if GHL sync fails
    }

    return NextResponse.json({
      message: 'Vendor/Lender created successfully',
      user: {
        id: newUser.user.id,
        email: newUser.user.email,
      }
    })
  } catch (error: any) {
    console.error('Error in create-vendor-lender:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create vendor/lender' },
      { status: 500 }
    )
  }
}
