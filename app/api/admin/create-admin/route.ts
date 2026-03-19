import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Check if user is authenticated
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if current user is a super admin
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('role, is_admin')
      .eq('id', currentUser.id)
      .single()

    if (!currentProfile?.is_admin || currentProfile.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Only super admins can create admin users' },
        { status: 403 }
      )
    }

    // Get request data
    const { first_name, last_name, email, phone, role, password } = await request.json()

    if (!first_name || !last_name || !email || !password || !role) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate role
    if (!['admin', 'super_admin'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be admin or super_admin' },
        { status: 400 }
      )
    }

    // Call the secure Edge Function to create the admin user
    // The Edge Function uses the service role key securely stored in Supabase
    const { data, error } = await supabase.functions.invoke('create-admin', {
      body: {
        first_name,
        last_name,
        email,
        phone,
        role,
        password,
      },
    })

    if (error) {
      console.error('Error calling Edge Function:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to create admin user' },
        { status: 500 }
      )
    }

    if (data?.error) {
      return NextResponse.json(
        { error: data.error },
        { status: data.status || 500 }
      )
    }

    return NextResponse.json({
      message: 'Admin created successfully',
      user: data?.user || {},
    })
  } catch (error: any) {
    console.error('Error in create-admin:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create admin' },
      { status: 500 }
    )
  }
}
