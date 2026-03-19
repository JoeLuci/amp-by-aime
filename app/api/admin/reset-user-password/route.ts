import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Check if user is authenticated
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if current user is an admin
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('role, is_admin')
      .eq('id', currentUser.id)
      .single()

    if (!currentProfile?.is_admin) {
      return NextResponse.json(
        { error: 'Only admins can reset user passwords' },
        { status: 403 }
      )
    }

    // Get request data
    const { user_id, new_password } = await request.json()

    if (!user_id || !new_password) {
      return NextResponse.json(
        { error: 'Missing required fields: user_id and new_password' },
        { status: 400 }
      )
    }

    // Validate password length
    if (new_password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    // Get target user's profile to verify they exist
    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('id, email, is_admin, role')
      .eq('id', user_id)
      .single()

    if (!targetProfile) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Only super_admins can reset passwords for other admins
    if (targetProfile.is_admin && currentProfile.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Only super admins can reset passwords for admin users' },
        { status: 403 }
      )
    }

    // Use admin client with service role to update the user's password
    const adminClient = createAdminClient()

    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      user_id,
      { password: new_password }
    )

    if (updateError) {
      console.error('Error updating user password:', updateError)
      return NextResponse.json(
        { error: updateError.message || 'Failed to reset password' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Password reset successfully',
    })
  } catch (error: any) {
    console.error('Error in reset-user-password:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to reset password' },
      { status: 500 }
    )
  }
}
