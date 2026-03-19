'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Plus, Send, Calendar, Users, Trash2, Eye } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Notification {
  id: string
  title: string
  message: string
  type: string
  target_roles: string[] | null
  target_plan_tiers: string[] | null
  content_type: string | null
  content_id: string | null
  scheduled_at: string | null
  expires_at: string | null
  is_active: boolean
  created_at: string
  created_by: string | null
  creator?: {
    full_name?: string
    email?: string
  }
}

interface NotificationsManagerProps {
  notifications: Notification[]
}

const USER_ROLES = [
  'Loan Officer',
  'Broker Owner',
  'Loan Officer Assistant',
  'Processor',
  'Partner Lender',
  'Partner Vendor',
]

const PLAN_TIERS = [
  'Premium Guest',
  'Premium',
  'Elite',
  'VIP',
  'Premium Processor',
  'Elite Processor',
  'VIP Processor',
]

const NOTIFICATION_TYPES = [
  { value: 'info', label: 'Info', color: 'bg-blue-500' },
  { value: 'success', label: 'Success', color: 'bg-green-500' },
  { value: 'warning', label: 'Warning', color: 'bg-yellow-500' },
  { value: 'error', label: 'Error', color: 'bg-red-500' },
  { value: 'announcement', label: 'Announcement', color: 'bg-purple-500' },
]

export function NotificationsManager({ notifications: initialNotifications }: NotificationsManagerProps) {
  const [notifications, setNotifications] = useState(initialNotifications)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [estimatedRecipients, setEstimatedRecipients] = useState<number | null>(null)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  // Pagination calculations
  const totalItems = notifications.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedNotifications = notifications.slice(startIndex, endIndex)

  // Form state
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [type, setType] = useState('info')
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [selectedTiers, setSelectedTiers] = useState<string[]>([])
  const [scheduledDate, setScheduledDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')

  const resetForm = () => {
    setTitle('')
    setMessage('')
    setType('info')
    setSelectedRoles([])
    setSelectedTiers([])
    setScheduledDate('')
    setExpiryDate('')
    setEstimatedRecipients(null)
  }

  const toggleRole = (role: string) => {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    )
  }

  const toggleTier = (tier: string) => {
    setSelectedTiers(prev =>
      prev.includes(tier) ? prev.filter(t => t !== tier) : [...prev, tier]
    )
  }

  const estimateRecipients = async () => {
    try {
      const response = await fetch('/api/admin/notifications/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roles: selectedRoles.length > 0 ? selectedRoles : null,
          tiers: selectedTiers.length > 0 ? selectedTiers : null,
        }),
      })
      const data = await response.json()
      setEstimatedRecipients(data.count)
    } catch (error) {
      console.error('Error estimating recipients:', error)
    }
  }

  const handleCreateNotification = async () => {
    console.log('Creating notification...', { title, message, type })
    setLoading(true)
    try {
      const response = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          message,
          type,
          target_roles: selectedRoles.length > 0 ? selectedRoles : null,
          target_plan_tiers: selectedTiers.length > 0 ? selectedTiers : null,
          scheduled_at: scheduledDate || null,
          expires_at: expiryDate || null,
        }),
      })

      console.log('Response status:', response.status)
      const data = await response.json()
      console.log('Response data:', data)

      if (response.ok) {
        setNotifications([data, ...notifications])
        setIsCreateOpen(false)
        resetForm()
        toast.success('Notification sent successfully')
      } else {
        toast.error(data.error || 'Failed to create notification')
      }
    } catch (error) {
      console.error('Error creating notification:', error)
      toast.error('Failed to create notification. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteNotification = async (id: string) => {
    setDeleteId(id)
    setIsDeleteOpen(true)
  }

  const confirmDelete = async () => {
    if (!deleteId) return

    try {
      const response = await fetch(`/api/admin/notifications/${deleteId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setNotifications(notifications.filter(n => n.id !== deleteId))
        setIsDeleteOpen(false)
        setDeleteId(null)
        toast.success('Notification deleted successfully')
      } else {
        throw new Error('Failed to delete')
      }
    } catch (error) {
      console.error('Error deleting notification:', error)
      toast.error('Failed to delete notification')
      setIsDeleteOpen(false)
      setDeleteId(null)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleString()
  }

  const getTypeColor = (type: string) => {
    return NOTIFICATION_TYPES.find(t => t.value === type)?.color || 'bg-gray-500'
  }

  return (
    <div className="space-y-6">
      {/* Create Notification Button */}
      <div className="flex justify-end">
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#dd1969] hover:bg-[#c01559]">
              <Plus className="w-4 h-4 mr-2" />
              Create Notification
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Notification</DialogTitle>
              <DialogDescription>
                Send a notification to specific user groups
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Title */}
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter notification title"
                />
              </div>

              {/* Message */}
              <div>
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Enter notification message"
                  rows={4}
                />
              </div>

              {/* Type */}
              <div>
                <Label htmlFor="type">Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTIFICATION_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${t.color}`} />
                          {t.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Target Roles */}
              <div>
                <Label>Target Roles (leave empty for all)</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {USER_ROLES.map(role => (
                    <Badge
                      key={role}
                      variant={selectedRoles.includes(role) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleRole(role)}
                    >
                      {role}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Target Tiers */}
              <div>
                <Label>Target Plan Tiers (leave empty for all)</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {PLAN_TIERS.map(tier => (
                    <Badge
                      key={tier}
                      variant={selectedTiers.includes(tier) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleTier(tier)}
                    >
                      {tier}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Estimate Recipients */}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={estimateRecipients}
                  className="w-full"
                >
                  <Users className="w-4 h-4 mr-2" />
                  Estimate Recipients
                </Button>
                {estimatedRecipients !== null && (
                  <p className="text-sm text-gray-600 mt-2">
                    This notification will be sent to approximately <strong>{estimatedRecipients}</strong> users
                  </p>
                )}
              </div>

              {/* Schedule Date */}
              <div>
                <Label htmlFor="scheduled">Schedule (optional)</Label>
                <Input
                  id="scheduled"
                  type="datetime-local"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">Leave empty to send immediately</p>
              </div>

              {/* Expiry Date */}
              <div>
                <Label htmlFor="expiry">Expiry Date (optional)</Label>
                <Input
                  id="expiry"
                  type="datetime-local"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">Notification will be hidden after this date</p>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsPreviewOpen(true)}
                  className="flex-1"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Preview
                </Button>
                <Button
                  onClick={handleCreateNotification}
                  disabled={!title || !message || loading}
                  className="flex-1 bg-[#dd1969] hover:bg-[#c01559]"
                >
                  <Send className="w-4 h-4 mr-2" />
                  {loading ? 'Sending...' : 'Send Notification'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Recent Notifications */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Recent Activity (Last 30 Days)</h2>
          <p className="text-sm text-gray-500 mt-1">View recently sent notifications for reference</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Notification
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Audience
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sent By
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Schedule
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedNotifications.map(notification => (
                <tr key={notification.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium text-gray-900">{notification.title}</div>
                      <div className="text-sm text-gray-500 line-clamp-2">{notification.message}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${getTypeColor(notification.type)}`} />
                      <span className="capitalize">{notification.type}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm">
                      {notification.target_roles ? (
                        <div className="mb-1">
                          <span className="font-medium">Roles:</span> {notification.target_roles.join(', ')}
                        </div>
                      ) : (
                        <div className="mb-1 text-gray-500">All Roles</div>
                      )}
                      {notification.target_plan_tiers ? (
                        <div>
                          <span className="font-medium">Tiers:</span> {notification.target_plan_tiers.join(', ')}
                        </div>
                      ) : (
                        <div className="text-gray-500">All Tiers</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {notification.creator ? (
                      <div>
                        <div className="font-medium text-gray-900">
                          {notification.creator.full_name || 'Unknown'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {notification.creator.email}
                        </div>
                      </div>
                    ) : notification.content_type ? (
                      <div className="text-gray-500 italic">Auto-generated</div>
                    ) : (
                      <div className="text-gray-400">-</div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div>
                      <div>
                        <Calendar className="w-3 h-3 inline mr-1" />
                        {formatDate(notification.scheduled_at)}
                      </div>
                      {notification.expires_at && (
                        <div className="text-gray-500 text-xs">
                          Expires: {formatDate(notification.expires_at)}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={notification.is_active ? 'default' : 'secondary'}>
                      {notification.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteNotification(notification.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {paginatedNotifications.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    No notifications yet. Create your first notification above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalItems > 0 && (
          <div className="px-6 py-4 border-t flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                Showing {startIndex + 1} to {Math.min(endIndex, totalItems)} of {totalItems} notifications
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Per page:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-gray-600 px-2">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                Last
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Notification Preview</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="border rounded-lg p-4 bg-gray-50">
              <div className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-2 ${getTypeColor(type)}`} />
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900 mb-1">{title || 'Notification Title'}</h4>
                  <p className="text-sm text-gray-600">{message || 'Notification message will appear here...'}</p>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Notification?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this notification? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
