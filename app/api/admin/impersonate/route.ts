import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const COOKIE_NAME = 'impersonationSettings'
const MAX_AGE = 60 * 60 * 4 // 4 hours

// POST - Start impersonation session
export async function POST(request: NextRequest) {
  try {
    // Check if user is authenticated and is an admin
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('is_admin, full_name, email')
      .eq('id', user.id)
      .single()

    if (!adminProfile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { targetUserId } = body

    if (!targetUserId) {
      return NextResponse.json({ error: 'Target user ID required' }, { status: 400 })
    }

    // Get target user profile using admin client to bypass RLS
    const supabaseAdmin = createAdminClient()
    const { data: targetUser, error: targetError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, is_admin, role')
      .eq('id', targetUserId)
      .single()

    if (targetError || !targetUser) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
    }

    // Cannot impersonate admins
    if (targetUser.is_admin || targetUser.role === 'admin' || targetUser.role === 'super_admin') {
      return NextResponse.json({ error: 'Cannot impersonate admin users' }, { status: 403 })
    }

    // Create audit log entry
    const { error: logError } = await supabaseAdmin
      .from('admin_impersonation_logs')
      .insert({
        admin_user_id: user.id,
        impersonated_user_id: targetUserId,
        started_at: new Date().toISOString()
      })

    if (logError) {
      console.error('Failed to create impersonation audit log:', logError)
      // Don't fail the request, just log it
    }

    // Set impersonation cookie
    const impersonationSettings = {
      impersonatedUserId: targetUser.id,
      impersonatedUserName: targetUser.full_name || targetUser.email,
      impersonatedUserEmail: targetUser.email,
      adminUserId: user.id,
      adminUserName: adminProfile.full_name || adminProfile.email,
      startedAt: new Date().toISOString(),
      isImpersonating: true
    }

    const cookieStore = await cookies()
    cookieStore.set(COOKIE_NAME, JSON.stringify(impersonationSettings), {
      httpOnly: false, // Need client access for banner display
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: MAX_AGE,
      path: '/'
    })

    console.log(`Admin ${adminProfile.email} started impersonating ${targetUser.email}`)

    return NextResponse.json({
      success: true,
      impersonating: {
        userId: targetUser.id,
        name: targetUser.full_name,
        email: targetUser.email
      }
    })
  } catch (error) {
    console.error('Error starting impersonation:', error)
    return NextResponse.json({ error: 'Failed to start impersonation' }, { status: 500 })
  }
}

// DELETE - End impersonation session
export async function DELETE() {
  try {
    // Check if user is authenticated and is an admin
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('is_admin, email')
      .eq('id', user.id)
      .single()

    if (!adminProfile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Get current impersonation settings to update audit log
    const cookieStore = await cookies()
    const impersonationCookie = cookieStore.get(COOKIE_NAME)

    if (impersonationCookie) {
      try {
        const settings = JSON.parse(impersonationCookie.value)
        if (settings.isImpersonating && settings.impersonatedUserId) {
          // Update audit log with end time
          const supabaseAdmin = createAdminClient()
          await supabaseAdmin
            .from('admin_impersonation_logs')
            .update({ ended_at: new Date().toISOString() })
            .eq('admin_user_id', user.id)
            .eq('impersonated_user_id', settings.impersonatedUserId)
            .is('ended_at', null)

          console.log(`Admin ${adminProfile.email} stopped impersonating user ${settings.impersonatedUserId}`)
        }
      } catch {
        // Cookie parsing failed, just clear it
      }
    }

    // Clear impersonation cookie
    cookieStore.delete(COOKIE_NAME)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error ending impersonation:', error)
    return NextResponse.json({ error: 'Failed to end impersonation' }, { status: 500 })
  }
}

// GET - Check current impersonation status
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!adminProfile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const cookieStore = await cookies()
    const impersonationCookie = cookieStore.get(COOKIE_NAME)

    if (!impersonationCookie) {
      return NextResponse.json({ isImpersonating: false })
    }

    try {
      const settings = JSON.parse(impersonationCookie.value)
      return NextResponse.json(settings)
    } catch {
      return NextResponse.json({ isImpersonating: false })
    }
  } catch (error) {
    console.error('Error checking impersonation status:', error)
    return NextResponse.json({ error: 'Failed to check impersonation status' }, { status: 500 })
  }
}
