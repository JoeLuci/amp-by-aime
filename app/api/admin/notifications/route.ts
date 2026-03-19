import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()

  // Check admin access
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user?.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await request.json()
  const {
    title,
    message,
    type,
    target_roles,
    target_plan_tiers,
    scheduled_at,
    expires_at,
  } = body

  try {
    // Call the database function to create notification and send to users
    const { data, error } = await supabase.rpc('create_notification_for_users', {
      p_title: title,
      p_message: message,
      p_notification_type: type,
      p_target_roles: target_roles,
      p_target_plan_tiers: target_plan_tiers,
      p_content_type: 'custom',
      p_content_id: null,
      p_scheduled_at: scheduled_at,
      p_expires_at: expires_at,
      p_created_by: user?.id,
    })

    if (error) {
      console.error('Error creating notification:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Fetch the created notification
    const { data: notification } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', data)
      .single()

    return NextResponse.json(notification)
  } catch (error) {
    console.error('Error creating notification:', error)
    return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 })
  }
}
