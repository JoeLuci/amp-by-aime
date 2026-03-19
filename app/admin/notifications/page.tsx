import { createClient } from '@/lib/supabase/server'
import { NotificationsManager } from '@/components/admin/NotificationsManager'

export default async function ManageNotificationsPage() {
  const supabase = await createClient()

  // Fetch recent notifications (last 30 days) for reference
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: notifications, error } = await supabase
    .from('notifications')
    .select('*')
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('Error fetching notifications:', error)
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Send Notifications</h1>
        <p className="text-gray-600">Send announcements and updates to your users</p>
      </div>

      <NotificationsManager notifications={notifications || []} />
    </div>
  )
}
