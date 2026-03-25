import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// PATCH - Update a user's profile (admin only)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params
    const supabase = await createClient()

    // Check if user is authenticated
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if current user is an admin
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('is_admin, role')
      .eq('id', currentUser.id)
      .single()

    if (!currentProfile?.is_admin) {
      return NextResponse.json(
        { error: 'Only admins can access this endpoint' },
        { status: 403 }
      )
    }

    const body = await request.json()

    const {
      first_name,
      last_name,
      email,
      phone,
      role,
      escalations_remaining,
      has_completed_trial,
      engagement_level,
      // Extended profile fields
      avatar_url,
      address,
      city,
      state,
      zip_code,
      nmls_number,
      state_licenses,
      birthday,
      gender,
      languages_spoken,
      race,
      company,
      company_nmls,
      company_address,
      company_city,
      company_state,
      company_zip_code,
      company_phone,
      scotsman_guide_subscription,
      // Super admin only fields
      stripe_customer_id,
      stripe_subscription_id,
    } = body

    // Validate role - only allow member-facing roles
    // Internal roles (admin, super_admin, member, partner_vendor, partner_lender)
    // must be set through other means
    const ALLOWED_MEMBER_ROLES = [
      'broker_owner',
      'loan_officer',
      'loan_officer_assistant',
      'processor',
    ]

    if (role !== undefined && role !== '' && !ALLOWED_MEMBER_ROLES.includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Only member roles (Broker Owner, Loan Officer, LO Assistant, Processor) can be assigned through this endpoint.' },
        { status: 400 }
      )
    }

    // Use admin client to bypass RLS
    const supabaseAdmin = createAdminClient()

    // Build update object with only provided fields
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (first_name !== undefined) updateData.first_name = first_name
    if (last_name !== undefined) updateData.last_name = last_name
    if (first_name !== undefined || last_name !== undefined) {
      updateData.full_name = `${first_name || ''} ${last_name || ''}`.trim()
    }
    if (email !== undefined) updateData.email = email
    if (phone !== undefined) updateData.phone = phone
    if (role !== undefined) updateData.role = role
    if (escalations_remaining !== undefined) updateData.escalations_remaining = escalations_remaining
    if (has_completed_trial !== undefined) updateData.has_completed_trial = has_completed_trial
    if (engagement_level !== undefined) updateData.engagement_level = engagement_level || null

    // Extended profile fields
    if (avatar_url !== undefined) updateData.avatar_url = avatar_url
    if (address !== undefined) updateData.address = address
    if (city !== undefined) updateData.city = city
    if (state !== undefined) updateData.state = state
    if (zip_code !== undefined) updateData.zip_code = zip_code
    if (nmls_number !== undefined) updateData.nmls_number = nmls_number || null
    if (state_licenses !== undefined) updateData.state_licenses = state_licenses
    if (birthday !== undefined) updateData.birthday = birthday || null
    if (gender !== undefined) updateData.gender = gender
    if (languages_spoken !== undefined) updateData.languages_spoken = languages_spoken
    if (race !== undefined) updateData.race = race
    if (company !== undefined) updateData.company = company
    if (company_nmls !== undefined) updateData.company_nmls = company_nmls
    if (company_address !== undefined) updateData.company_address = company_address
    if (company_city !== undefined) updateData.company_city = company_city
    if (company_state !== undefined) updateData.company_state = company_state
    if (company_zip_code !== undefined) updateData.company_zip_code = company_zip_code
    if (company_phone !== undefined) updateData.company_phone = company_phone
    if (scotsman_guide_subscription !== undefined) updateData.scotsman_guide_subscription = scotsman_guide_subscription

    // Super admin only: allow updating Stripe IDs
    if (currentProfile.role === 'super_admin') {
      if (stripe_customer_id !== undefined) updateData.stripe_customer_id = stripe_customer_id || null
      if (stripe_subscription_id !== undefined) {
        // Guard: check if this subscription ID already belongs to a different profile
        if (stripe_subscription_id) {
          const { data: existingOwner } = await supabaseAdmin
            .from('profiles')
            .select('id, email')
            .eq('stripe_subscription_id', stripe_subscription_id)
            .neq('id', userId)
            .limit(1)
            .single()

          if (existingOwner) {
            return NextResponse.json(
              { error: `Subscription ${stripe_subscription_id} is already assigned to ${existingOwner.email}. Remove it from that user first.` },
              { status: 400 }
            )
          }
        }
        updateData.stripe_subscription_id = stripe_subscription_id || null
      }
    }

    // If email is changing, update auth.users first
    if (email !== undefined) {
      const { error: authEmailError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        { email }
      )

      if (authEmailError) {
        console.error('Error updating auth email:', authEmailError)
        return NextResponse.json(
          { error: `Failed to update login email: ${authEmailError.message}` },
          { status: 500 }
        )
      }
    }

    // Update the user profile
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single()

    if (error) {
      console.error('Error updating user:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to update user' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'User updated successfully',
      user: data,
    })
  } catch (error: any) {
    console.error('Error in PATCH /api/admin/users/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update user' },
      { status: 500 }
    )
  }
}

// DELETE - Delete a user (admin only)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params
    const supabase = await createClient()

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
        { error: 'Only admins can delete users' },
        { status: 403 }
      )
    }

    // Prevent admin from deleting themselves
    if (userId === currentUser.id) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      )
    }

    // Use admin client to delete the user from auth.users
    // This will cascade to delete the profile if there's a FK constraint,
    // otherwise we delete the profile first
    const supabaseAdmin = createAdminClient()

    // First delete the profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId)

    if (profileError) {
      console.error('Error deleting profile:', profileError)
      // Continue anyway - might be FK constraint that cascades
    }

    // Then delete from auth.users
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (authError) {
      console.error('Error deleting auth user:', authError)
      return NextResponse.json(
        { error: authError.message || 'Failed to delete user' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'User deleted successfully',
    })
  } catch (error: any) {
    console.error('Error in DELETE /api/admin/users/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete user' },
      { status: 500 }
    )
  }
}

// GET - Get a user's profile (admin only)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params
    const supabase = await createClient()

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

    // Use admin client to bypass RLS
    const supabaseAdmin = createAdminClient()

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Error fetching user:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to fetch user' },
        { status: 500 }
      )
    }

    return NextResponse.json({ user: data })
  } catch (error: any) {
    console.error('Error in GET /api/admin/users/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch user' },
      { status: 500 }
    )
  }
}
