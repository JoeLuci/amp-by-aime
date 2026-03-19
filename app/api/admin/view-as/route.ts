import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    // Check if user is authenticated and is an admin
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { role, plan_tier, specificUserId, specificUserName } = body

    const viewAsSettings = {
      role,
      plan_tier,
      isViewingAs: true,
      specificUserId,
      specificUserName
    }

    const cookieStore = await cookies()
    cookieStore.set('viewAsSettings', JSON.stringify(viewAsSettings), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 // 24 hours
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error setting view-as:', error)
    return NextResponse.json({ error: 'Failed to set view-as mode' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    // Check if user is authenticated and is an admin
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const cookieStore = await cookies()
    cookieStore.delete('viewAsSettings')

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error clearing view-as:', error)
    return NextResponse.json({ error: 'Failed to clear view-as mode' }, { status: 500 })
  }
}
