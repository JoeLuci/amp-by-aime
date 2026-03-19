'use client'

import { useState, useEffect, useRef } from 'react'
import { Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
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

export default function NotificationsDropdown() {
  const supabase = createClient()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchNotifications()

    // Set up real-time subscription
    const channel = supabase
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_notifications'
        },
        () => {
          fetchNotifications()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchNotifications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return
      }

      // Fetch notifications with user_notification status
      const { data, error } = await supabase
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
        .limit(20)

      if (error) throw error

      // Filter out expired notifications and transform data
      const now = new Date()
      const formattedNotifications = (data || [])
        .filter((item: any) => {
          if (!item.notification) return false
          if (!item.notification.expires_at) return true
          return new Date(item.notification.expires_at) > now
        })
        .map((item: any) => {
          // Generate link based on content_type and content_id
          let link = null
          if (item.notification.content_type && item.notification.content_id) {
            switch (item.notification.content_type) {
              case 'resource':
                // Would need to fetch slug, for now just null
                link = null
                break
              case 'lender':
                link = null
                break
              case 'vendor':
                link = null
                break
              case 'event':
                link = `/dashboard/events/${item.notification.content_id}`
                break
            }
          }

          return {
            id: item.notification.id,
            title: item.notification.title,
            message: item.notification.message,
            link: link,
            type: item.notification.type,
            icon: null,
            created_at: item.created_at,
            user_notification_id: item.id,
            is_read: item.is_read,
            read_at: null
          }
        })

      setNotifications(formattedNotifications)
      setUnreadCount(formattedNotifications.filter((n: Notification) => !n.is_read).length)
    } catch (error) {
      // Silent error handling - notifications are not critical
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

      // Update local state
      setNotifications(prev =>
        prev.map(n =>
          n.user_notification_id === userNotificationId
            ? { ...n, is_read: true, read_at: new Date().toISOString() }
            : n
        )
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  const dismissNotification = async (userNotificationId: string) => {
    try {
      const { error } = await supabase
        .from('user_notifications')
        .delete()
        .eq('id', userNotificationId)

      if (error) throw error

      // Update local state
      setNotifications(prev => prev.filter(n => n.user_notification_id !== userNotificationId))
      setUnreadCount(prev => {
        const dismissed = notifications.find(n => n.user_notification_id === userNotificationId)
        return dismissed && !dismissed.is_read ? Math.max(0, prev - 1) : prev
      })
    } catch (error) {
      console.error('Error dismissing notification:', error)
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
      setUnreadCount(0)
      toast.success('All notifications marked as read')
    } catch (error) {
      console.error('Error marking all as read:', error)
      toast.error('Failed to mark notifications as read')
    }
  }

  const clearAllRead = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('user_notifications')
        .delete()
        .eq('user_id', user.id)
        .eq('is_read', true)
        .select()

      if (error) throw error

      // Update local state immediately - only keep unread
      const unreadNotifications = notifications.filter(n => !n.is_read)
      setNotifications(unreadNotifications)

      toast.success(`Cleared ${data?.length || 0} read notifications`)
    } catch (error) {
      toast.error('Failed to clear notifications')
    }
  }

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsRead(notification.user_notification_id)
    }

    // Extract URL from message if it exists (format: [URL:/path])
    let url = notification.link
    if (!url && notification.message) {
      const urlMatch = notification.message.match(/\[URL:(.*?)\]/)
      if (urlMatch) {
        url = urlMatch[1]
      }
    }

    if (url) {
      router.push(url)
      setIsOpen(false)
    }
  }

  // Clean message by removing URL tags
  const getCleanMessage = (message: string) => {
    return message.replace(/\s*\[URL:.*?\]\s*/, '')
  }

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'info': return 'bg-[#25314e]' // Navy blue
      case 'success': return 'bg-green-500'
      case 'warning': return 'bg-yellow-500'
      case 'error': return 'bg-red-500'
      case 'announcement': return 'bg-[#dd1969]' // Brand pink
      case 'lender': return 'bg-[#94a3b8]' // Lender gray-blue
      case 'vendor': return 'bg-[#0066cc]' // Vendor blue
      case 'resource': return 'bg-purple-500'
      case 'event': return 'bg-[#dd1969]' // Brand pink
      default: return 'bg-gray-500'
    }
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) return 'Just now'
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`
    return date.toLocaleDateString()
  }

  return (
    <div ref={dropdownRef} className="relative">
      {/* Bell Icon */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative text-gray-600 hover:text-gray-900 transition-colors"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-[#dd1969] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Notifications</h3>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-[#dd1969] hover:text-[#c01559] font-medium"
                >
                  Mark all read
                </button>
              )}
              {notifications.some(n => n.is_read) && (
                <button
                  onClick={clearAllRead}
                  className="text-xs text-gray-600 hover:text-gray-900 font-medium"
                >
                  Clear read
                </button>
              )}
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="px-4 py-8 text-center text-gray-500">
                Loading notifications...
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500">
                No notifications yet
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {notifications.map((notification) => (
                  <div
                    key={notification.user_notification_id}
                    className={`relative group ${
                      !notification.is_read ? 'bg-blue-50' : ''
                    }`}
                  >
                    <button
                      onClick={() => handleNotificationClick(notification)}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 mt-1">
                          <div className={`w-3 h-3 rounded-full ${getNotificationColor(notification.type)}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium text-gray-900 text-sm">
                              {notification.title}
                            </p>
                            {!notification.is_read && (
                              <span className="w-2 h-2 bg-[#dd1969] rounded-full flex-shrink-0 mt-1.5" />
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                            {getCleanMessage(notification.message)}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {formatTimeAgo(notification.created_at)}
                          </p>
                        </div>
                      </div>
                    </button>
                    {/* Dismiss button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        dismissNotification(notification.user_notification_id)
                      }}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600 p-1"
                      title="Dismiss"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-200 text-center">
              <button
                onClick={() => {
                  router.push('/dashboard/notifications')
                  setIsOpen(false)
                }}
                className="text-sm text-[#dd1969] hover:text-[#c01559] font-medium"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
