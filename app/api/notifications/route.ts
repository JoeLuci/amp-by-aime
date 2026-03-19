import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Fetch user's notifications
    const { data: userNotifications, error } = await supabase
      .from('user_notifications')
      .select(`
        id,
        is_read,
        created_at,
        notification:notification_id (
          id,
          title,
          message,
          type,
          content_type,
          content_id,
          expires_at
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Error fetching notifications:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Filter out expired notifications
    const now = new Date()
    const activeNotifications = userNotifications?.filter(un => {
      const notification = un.notification as any
      if (!notification) return false
      if (!notification.expires_at) return true
      return new Date(notification.expires_at) > now
    }) || []

    return NextResponse.json({ notifications: activeNotifications })
  } catch (error) {
    console.error('Error fetching notifications:', error)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}
