'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Notification {
  id: string
  title: string
  message: string
  link: string | null
  type: string
  icon: string | null
  created_at: string
  user_notification_id: string
  is_read: boolean
  read_at: string | null
}

export default function NotificationsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  useEffect(() => {
    fetchNotifications()
  }, [])

  const fetchNotifications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('user_notifications')
        .select(`
          id,
          is_read,
          read_at,
          notification:notifications (
            id,
            title,
            message,
            link,
            type,
            icon,
            created_at
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      const formattedNotifications = (data || []).map((item: any) => ({
        id: item.notification.id,
        title: item.notification.title,
        message: item.notification.message,
        link: item.notification.link,
        type: item.notification.type,
        icon: item.notification.icon,
        created_at: item.notification.created_at,
        user_notification_id: item.id,
        is_read: item.is_read,
        read_at: item.read_at
      }))

      setNotifications(formattedNotifications)
    } catch (error) {
      console.error('Error fetching notifications:', error)
      toast.error('Failed to load notifications')
    } finally {
      setIsLoading(false)
    }
  }

  const markAsRead = async (userNotificationId: string) => {
    try {
      const { error } = await supabase
        .from('user_notifications')
        .update({ is_read: true })
        .eq('id', userNotificationId)

      if (error) throw error

      setNotifications(prev =>
        prev.map(n =>
          n.user_notification_id === userNotificationId
            ? { ...n, is_read: true, read_at: new Date().toISOString() }
            : n
        )
      )
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  const markAllAsRead = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('user_notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false)

      if (error) throw error

      setNotifications(prev =>
        prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
      )
      toast.success('All notifications marked as read')
    } catch (error) {
      console.error('Error marking all as read:', error)
      toast.error('Failed to mark notifications as read')
    }
  }

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsRead(notification.user_notification_id)
    }

    if (notification.link) {
      router.push(notification.link)
    }
  }

  const getNotificationIcon = (type: string, customIcon?: string | null) => {
    if (customIcon) return customIcon

    switch (type) {
      case 'lender': return '🏦'
      case 'vendor': return '🛒'
      case 'resource': return '📚'
      case 'announcement': return '📢'
      case 'update': return '🔔'
      case 'promotion': return '🎉'
      default: return '📌'
    }
  }

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date)
  }

  const filteredNotifications = filter === 'all'
    ? notifications
    : notifications.filter(n => !n.is_read)

  const unreadCount = notifications.filter(n => !n.is_read).length

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#dd1969]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Page Header */}
      <div className="px-4 md:px-8 py-6 md:py-8">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl md:text-4xl font-bold text-[#dd1969]">
            NOTIFICATIONS
          </h1>
          {unreadCount > 0 && (
            <Button
              onClick={markAllAsRead}
              variant="outline"
              className="border-[#dd1969] text-[#dd1969] hover:bg-[#dd1969] hover:text-white"
            >
              Mark all as read
            </Button>
          )}
        </div>
        <p className="text-gray-600 text-sm md:text-base">
          Stay updated with the latest news and updates
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="px-4 md:px-8 pb-4">
        <div className="flex gap-4 border-b border-gray-200">
          <button
            onClick={() => setFilter('all')}
            className={`pb-3 px-2 font-medium text-sm transition-colors ${
              filter === 'all'
                ? 'text-[#dd1969] border-b-2 border-[#dd1969]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            All ({notifications.length})
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`pb-3 px-2 font-medium text-sm transition-colors ${
              filter === 'unread'
                ? 'text-[#dd1969] border-b-2 border-[#dd1969]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Unread ({unreadCount})
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="px-4 md:px-8 pb-8">
        {filteredNotifications.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <p className="text-gray-500">
              {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md divide-y divide-gray-100">
            {filteredNotifications.map((notification) => (
              <button
                key={notification.user_notification_id}
                onClick={() => handleNotificationClick(notification)}
                className={`w-full px-6 py-4 text-left hover:bg-gray-50 transition-colors ${
                  !notification.is_read ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex gap-4">
                  <div className="text-3xl flex-shrink-0">
                    {getNotificationIcon(notification.type, notification.icon)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900">
                            {notification.title}
                          </h3>
                          {!notification.is_read && (
                            <span className="w-2 h-2 bg-[#dd1969] rounded-full flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-gray-600 mt-1">
                          {notification.message}
                        </p>
                        <p className="text-sm text-gray-400 mt-2">
                          {formatDateTime(notification.created_at)}
                        </p>
                      </div>
                      <span className="inline-block bg-gray-100 text-gray-700 text-xs font-medium px-2.5 py-1 rounded capitalize">
                        {notification.type}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
