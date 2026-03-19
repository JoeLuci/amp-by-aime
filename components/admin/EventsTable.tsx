'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Edit, Trash2, Plus, Calendar, Upload, X, ChevronLeft, ChevronRight, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { BulkTaggingModal } from './BulkTaggingModal'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useSortableData } from '@/hooks/useSortableData'
import { SortableTableHeader } from '@/components/ui/sortable-table-header'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { MultiSelect } from '@/components/ui/multi-select'
import { Switch } from '@/components/ui/switch'
import { TagsMultiSelect } from '@/components/ui/tags-multi-select'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { CopyLinkButton } from '@/components/ui/copy-link-button'

interface Tag {
  id: string
  name: string
  slug: string
}

interface Event {
  id: string
  title: string
  description?: string
  event_type: string
  start_date: string
  end_date: string
  timezone?: string
  location?: string
  is_virtual: boolean
  meeting_url?: string
  registration_url?: string
  max_attendees?: number
  current_attendees?: number
  user_role_access?: string[]
  required_plan_tier?: string[]
  thumbnail_url?: string
  images?: string[]
  is_featured: boolean
  is_published: boolean
  is_recurring?: boolean
  recurrence_rule?: string
  recurrence_end_date?: string
  created_at: string
  updated_at?: string
  created_by?: string
  creator_name?: string
}

interface ContentType {
  id: string
  name: string
  slug: string
  color: string
}

interface EventsTableProps {
  events: Event[]
  contentTypes: ContentType[]
  tags: Tag[]
}

export function EventsTable({ events, contentTypes, tags }: EventsTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchTerm, setSearchTerm] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null)
  const [thumbnailPreview, setThumbnailPreview] = useState<string>('')
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<string | null>(null)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [bulkTaggingOpen, setBulkTaggingOpen] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    event_type: 'webinar',
    type_id: '',
    start_date: '',
    end_date: '',
    timezone: 'America/New_York',
    location: '',
    is_virtual: true,
    meeting_url: '',
    registration_url: '',
    max_attendees: 0,
    thumbnail_url: '',
    images: [] as string[],
    is_featured: false,
    is_published: true,
    user_role_access: [] as string[],
    required_plan_tier: [] as string[],
    tag_ids: [] as string[],
    is_recurring: false,
    recurrence_rule: '',
    recurrence_end_date: '',
  })

  // Handle opening editor from URL parameter (e.g., from search results)
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (editId) {
      const eventToEdit = events.find(e => e.id === editId)
      if (eventToEdit) {
        handleOpenDialog(eventToEdit)
        // Clean up the URL parameter
        router.replace('/admin/events', { scroll: false })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const filteredEvents = events.filter((event) => {
    const searchLower = searchTerm.toLowerCase()
    return (
      event.title?.toLowerCase().includes(searchLower) ||
      event.event_type?.toLowerCase().includes(searchLower) ||
      event.location?.toLowerCase().includes(searchLower)
    )
  })

  // Apply sorting to filtered data
  const { items: sortedEvents, requestSort, sortConfig } = useSortableData(filteredEvents)

  // Pagination
  const totalPages = Math.ceil(sortedEvents.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedEvents = sortedEvents.slice(startIndex, endIndex)

  // Reset to page 1 when search changes
  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  // Selection helpers
  const toggleSelectItem = (id: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const toggleSelectAll = () => {
    if (selectedItems.size === paginatedEvents.length) {
      setSelectedItems(new Set())
    } else {
      setSelectedItems(new Set(paginatedEvents.map(e => e.id)))
    }
  }

  const clearSelection = () => {
    setSelectedItems(new Set())
  }

  const handleBulkTagComplete = () => {
    clearSelection()
    router.refresh()
    window.location.reload()
  }

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setThumbnailFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setThumbnailPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      setImageFiles(prev => [...prev, ...files])

      files.forEach(file => {
        const reader = new FileReader()
        reader.onloadend = () => {
          setImagePreviews(prev => [...prev, reader.result as string])
        }
        reader.readAsDataURL(file)
      })
    }
  }

  const removeImage = (index: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index))
    setImagePreviews(prev => {
      const newPreviews = prev.filter((_, i) => i !== index)
      if (currentImageIndex >= newPreviews.length && newPreviews.length > 0) {
        setCurrentImageIndex(newPreviews.length - 1)
      }
      return newPreviews
    })
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }))
  }

  const nextImage = () => {
    setCurrentImageIndex((prev) =>
      prev === imagePreviews.length - 1 ? 0 : prev + 1
    )
  }

  const previousImage = () => {
    setCurrentImageIndex((prev) =>
      prev === 0 ? imagePreviews.length - 1 : prev - 1
    )
  }

  // Convert UTC timestamp to local time in the specified timezone for datetime-local input
  const convertFromUTC = (utcDatetime: string, timezone: string) => {
    const utcDate = new Date(utcDatetime)

    // Format the date in the target timezone
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    const parts = formatter.formatToParts(utcDate)
    const year = parts.find(p => p.type === 'year')?.value
    const month = parts.find(p => p.type === 'month')?.value
    const day = parts.find(p => p.type === 'day')?.value
    const hour = parts.find(p => p.type === 'hour')?.value
    const minute = parts.find(p => p.type === 'minute')?.value

    return `${year}-${month}-${day}T${hour}:${minute}`
  }

  const handleOpenDialog = async (event?: Event) => {
    if (event) {
      setEditingEvent(event)

      // Fetch event tags
      const supabase = createClient()
      const { data: eventTags } = await supabase
        .from('event_tags')
        .select('tag_id')
        .eq('event_id', event.id)

      // Derive event_type slug from type_id if it exists
      const typeId = (event as any).type_id || ''
      const matchingType = contentTypes.find(t => t.id === typeId)
      const eventTypeSlug = matchingType?.slug || event.event_type

      const eventTimezone = event.timezone || 'America/New_York'

      setFormData({
        title: event.title,
        description: event.description || '',
        event_type: eventTypeSlug,
        type_id: typeId,
        start_date: event.start_date ? convertFromUTC(event.start_date, eventTimezone) : '',
        end_date: event.end_date ? convertFromUTC(event.end_date, eventTimezone) : '',
        timezone: eventTimezone,
        location: event.location || '',
        is_virtual: event.is_virtual,
        meeting_url: event.meeting_url || '',
        registration_url: event.registration_url || '',
        max_attendees: event.max_attendees || 0,
        thumbnail_url: event.thumbnail_url || '',
        images: event.images || [],
        is_featured: event.is_featured,
        is_published: event.is_published,
        user_role_access: event.user_role_access || [],
        required_plan_tier: event.required_plan_tier || [],
        tag_ids: eventTags?.map(et => et.tag_id) || [],
        is_recurring: event.is_recurring || false,
        recurrence_rule: event.recurrence_rule || '',
        recurrence_end_date: event.recurrence_end_date ? convertFromUTC(event.recurrence_end_date, eventTimezone) : '',
      })
      setThumbnailPreview(event.thumbnail_url || '')
      setImagePreviews(event.images || [])
    } else {
      setEditingEvent(null)
      setFormData({
        title: '',
        description: '',
        event_type: 'webinar',
        type_id: '',
        start_date: '',
        end_date: '',
        timezone: 'America/New_York',
        location: '',
        is_virtual: true,
        meeting_url: '',
        registration_url: '',
        max_attendees: 0,
        thumbnail_url: '',
        images: [],
        is_featured: false,
        is_published: true,
        user_role_access: [],
        required_plan_tier: [],
        tag_ids: [],
        is_recurring: false,
        recurrence_rule: '',
        recurrence_end_date: '',
      })
      setThumbnailPreview('')
      setImagePreviews([])
    }
    setThumbnailFile(null)
    setImageFiles([])
    setCurrentImageIndex(0)
    setIsDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!formData.title || !formData.start_date || !formData.end_date) {
      toast.error('Please fill in required fields (Title, Start Date, End Date)')
      return
    }

    setIsSubmitting(true)

    try {
      const supabase = createClient()
      let thumbnailUrl = formData.thumbnail_url

      // Upload thumbnail if new file selected
      if (thumbnailFile) {
        const fileExt = thumbnailFile.name.split('.').pop()
        const fileName = `${Math.random()}.${fileExt}`
        const filePath = `events/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('resources')
          .upload(filePath, thumbnailFile)

        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage
          .from('resources')
          .getPublicUrl(filePath)

        thumbnailUrl = publicUrl
      }

      // Upload images if new files selected
      let imageUrls = [...formData.images]
      if (imageFiles.length > 0) {
        const uploadPromises = imageFiles.map(async (file) => {
          const fileExt = file.name.split('.').pop()
          const fileName = `${Math.random()}.${fileExt}`
          const filePath = `events/carousel/${fileName}`

          const { error: uploadError } = await supabase.storage
            .from('resources')
            .upload(filePath, file)

          if (uploadError) throw uploadError

          const { data: { publicUrl } } = supabase.storage
            .from('resources')
            .getPublicUrl(filePath)

          return publicUrl
        })

        const uploadedUrls = await Promise.all(uploadPromises)
        imageUrls = [...imageUrls, ...uploadedUrls]
      }

      // Convert local datetime input to UTC, treating input as being in the selected timezone
      const convertToUTC = (localDatetime: string, timezone: string) => {
        // Parse the datetime-local value
        const [datePart, timePart] = localDatetime.split('T')
        const [year, month, day] = datePart.split('-').map(Number)
        const [hours, minutes] = timePart.split(':').map(Number)

        // Create a date string with the timezone
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`

        // Use Intl to get the UTC offset for the selected timezone at this date
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })

        // Create date in UTC, then adjust for timezone offset
        const utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0))

        // Get the offset for the target timezone
        const targetDate = new Date(dateStr)
        const utcString = targetDate.toLocaleString('en-US', { timeZone: 'UTC' })
        const tzString = targetDate.toLocaleString('en-US', { timeZone: timezone })
        const utcTime = new Date(utcString).getTime()
        const tzTime = new Date(tzString).getTime()
        const offset = tzTime - utcTime

        // Adjust the UTC date by the timezone offset (subtract offset to convert local->UTC)
        return new Date(utcDate.getTime() - offset).toISOString()
      }

      // Map category slug to valid enum value (custom categories default to 'other')
      const validEventTypes = ['webinar', 'conference', 'training', 'networking', 'other', 'fuse']
      const eventTypeForEnum = validEventTypes.includes(formData.event_type)
        ? formData.event_type
        : 'other'

      const dataToSave = {
        title: formData.title,
        description: formData.description || null,
        event_type: eventTypeForEnum,
        type_id: formData.type_id || null,
        start_date: convertToUTC(formData.start_date, formData.timezone),
        end_date: convertToUTC(formData.end_date, formData.timezone),
        timezone: formData.timezone,
        location: formData.location || null,
        is_virtual: formData.is_virtual,
        meeting_url: formData.meeting_url || null,
        registration_url: formData.registration_url || null,
        max_attendees: formData.max_attendees || null,
        thumbnail_url: thumbnailUrl || null,
        images: imageUrls.length > 0 ? imageUrls : null,
        is_featured: formData.is_featured,
        is_published: formData.is_published,
        user_role_access: formData.user_role_access.length > 0 ? formData.user_role_access : null,
        required_plan_tier: formData.required_plan_tier.length > 0 ? formData.required_plan_tier : null,
        is_recurring: formData.is_recurring,
        recurrence_rule: formData.is_recurring && formData.recurrence_rule ? formData.recurrence_rule : null,
        recurrence_end_date: formData.is_recurring && formData.recurrence_end_date ? new Date(formData.recurrence_end_date).toISOString() : null,
      }

      let eventId = editingEvent?.id
      const wasPublished = editingEvent?.is_published
      const isNowPublished = dataToSave.is_published

      if (editingEvent) {
        const { error } = await supabase
          .from('events')
          .update(dataToSave)
          .eq('id', editingEvent.id)

        if (error) throw error
      } else {
        // Get current user ID for creator tracking
        const { data: { user } } = await supabase.auth.getUser()

        const { data: newEvent, error } = await supabase.from('events').insert([{
          ...dataToSave,
          created_by: user?.id
        }]).select('id').single()

        if (error) throw error
        eventId = newEvent?.id
      }

      // Send notification if event is being published (new or updated to published)
      if (isNowPublished && (!editingEvent || !wasPublished)) {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          const notificationTitle = `New Event: ${formData.title}`
          const notificationMessage = `Join us for ${formData.title} on ${new Date(formData.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. Click to learn more and register!`

          await supabase.rpc('create_notification_for_users', {
            p_title: notificationTitle,
            p_message: notificationMessage,
            p_notification_type: 'info',
            p_target_roles: formData.user_role_access.length > 0 ? formData.user_role_access : null,
            p_target_plan_tiers: formData.required_plan_tier.length > 0 ? formData.required_plan_tier : null,
            p_content_type: 'event',
            p_content_id: eventId,
            p_scheduled_at: null,
            p_expires_at: new Date(formData.start_date).toISOString(), // Expire after event starts
            p_created_by: user?.id,
          })
        } catch (notifError) {
          console.error('Error sending notification:', notifError)
          // Don't fail the whole operation if notification fails
        }
      }

      // Handle tags
      if (eventId) {
        // Delete existing tags
        await supabase.from('event_tags').delete().eq('event_id', eventId)

        // Insert new tags
        if (formData.tag_ids.length > 0) {
          const tagInserts = formData.tag_ids.map(tag_id => ({
            event_id: eventId,
            tag_id
          }))
          await supabase.from('event_tags').insert(tagInserts)
        }
      }

      toast.success('Event saved successfully!')
      router.refresh()
      window.location.reload()
      setIsDialogOpen(false)
    } catch (error: any) {
      console.error('Error saving event:', error)
      toast.error(error.message || 'Failed to save event. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteClick = (eventId: string) => {
    setItemToDelete(eventId)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return

    try {
      const supabase = createClient()
      const { error } = await supabase.from('events').delete().eq('id', itemToDelete)

      if (error) throw error

      toast.success('Event deleted successfully')
      setDeleteDialogOpen(false)
      setItemToDelete(null)
      router.refresh()
      window.location.reload()
    } catch (error) {
      console.error('Error deleting event:', error)
      toast.error('Failed to delete event. Please try again.')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="bg-white rounded-lg shadow-md">
      <div className="p-6 border-b border-gray-200">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <Input
            placeholder="Search events..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full md:max-w-md"
          />
          <Button
            onClick={() => handleOpenDialog()}
            className="bg-[#dd1969] hover:bg-[#c01559] whitespace-nowrap"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Event
          </Button>
        </div>

        {/* Bulk Actions Bar */}
        {selectedItems.size > 0 && (
          <div className="flex items-center gap-3 mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <span className="text-sm font-medium text-blue-900">
              {selectedItems.size} item{selectedItems.size > 1 ? 's' : ''} selected
            </span>
            <Button
              size="sm"
              onClick={() => setBulkTaggingOpen(true)}
              className="bg-[#dd1969] hover:bg-[#c01559] text-white"
            >
              <Tag className="w-4 h-4 mr-1" />
              Bulk Tag
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={clearSelection}
            >
              Clear Selection
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left">
                <Checkbox
                  checked={paginatedEvents.length > 0 && selectedItems.size === paginatedEvents.length}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all"
                />
              </th>
              <SortableTableHeader<Event>
                label="Event"
                sortKey="title"
                currentSortKey={sortConfig?.key as keyof Event}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
              />
              <SortableTableHeader<Event>
                label="Created By"
                sortKey="creator_name"
                currentSortKey={sortConfig?.key as keyof Event}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
              />
              <SortableTableHeader<Event>
                label="Created At"
                sortKey="created_at"
                currentSortKey={sortConfig?.key as keyof Event}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
              />
              <SortableTableHeader<Event>
                label="Status"
                sortKey="is_published"
                currentSortKey={sortConfig?.key as keyof Event}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
              />
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedEvents.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  No events found
                </td>
              </tr>
            ) : (
              paginatedEvents.map((event) => (
                <tr key={event.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4">
                    <Checkbox
                      checked={selectedItems.has(event.id)}
                      onCheckedChange={() => toggleSelectItem(event.id)}
                      aria-label={`Select ${event.title}`}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{event.title}</div>
                        <Badge className="bg-blue-100 text-blue-800 capitalize mt-1">
                          {event.event_type}
                        </Badge>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{event.creator_name || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      Created: {new Date(event.created_at).toLocaleDateString()}
                    </div>
                    {event.updated_at && (
                      <div className="text-sm text-gray-500">
                        Updated: {new Date(event.updated_at).toLocaleDateString()}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-wrap gap-1">
                      <Badge className={event.is_published ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                        {event.is_published ? 'Published' : 'Draft'}
                      </Badge>
                      {event.is_featured && (
                        <Badge className="bg-yellow-100 text-yellow-800">Featured</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <CopyLinkButton
                        path={`/dashboard/events/${event.id}`}
                        label="Copy event link"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(event)}
                        className="text-blue-600 hover:text-blue-900 hover:bg-blue-50"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(event.id)}
                        className="text-red-600 hover:text-red-900 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing <span className="font-semibold">{startIndex + 1}-{Math.min(endIndex, filteredEvents.length)}</span> of{' '}
              <span className="font-semibold">{filteredEvents.length}</span> events
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(page => {
                    return (
                      page === 1 ||
                      page === totalPages ||
                      Math.abs(page - currentPage) <= 1
                    )
                  })
                  .map((page, index, array) => {
                    const prevPage = array[index - 1]
                    const showEllipsis = prevPage && page - prevPage > 1

                    return (
                      <div key={page} className="flex items-center gap-1">
                        {showEllipsis && (
                          <span className="text-gray-500 px-2">...</span>
                        )}
                        <Button
                          variant={currentPage === page ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setCurrentPage(page)}
                          className={
                            currentPage === page
                              ? 'bg-[#dd1969] hover:bg-[#c01559] text-white'
                              : ''
                          }
                        >
                          {page}
                        </Button>
                      </div>
                    )
                  })}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEvent ? 'Edit Event' : 'Add New Event'}</DialogTitle>
            <DialogDescription>
              {editingEvent ? 'Update event information' : 'Create a new event for users'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Event Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Monthly Mortgage Mastermind"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Thumbnail</Label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                {thumbnailPreview ? (
                  <div className="relative">
                    <img src={thumbnailPreview} alt="Thumbnail preview" className="w-full h-48 object-contain rounded" />
                    <button
                      type="button"
                      onClick={() => {
                        setThumbnailFile(null)
                        setThumbnailPreview('')
                        setFormData({ ...formData, thumbnail_url: '' })
                      }}
                      className="absolute top-2 right-2 p-1 bg-red-500 hover:bg-red-600 text-white rounded-full"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label htmlFor="thumbnail" className="cursor-pointer block text-center">
                    <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm text-gray-600">Click to upload thumbnail</p>
                    <p className="text-xs text-gray-500 mt-1">PNG, JPG up to 5MB</p>
                  </label>
                )}
                <input
                  id="thumbnail"
                  type="file"
                  accept="image/*"
                  onChange={handleThumbnailChange}
                  className="hidden"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Additional Images (Carousel)</Label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                {imagePreviews.length > 0 ? (
                  <div className="space-y-2">
                    <div className="relative w-full h-64 bg-gray-100 rounded overflow-hidden">
                      <img
                        src={imagePreviews[currentImageIndex]}
                        alt={`Preview ${currentImageIndex + 1}`}
                        className="w-full h-full object-contain"
                      />
                      {imagePreviews.length > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={previousImage}
                            className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full"
                          >
                            <ChevronLeft className="w-5 h-5" />
                          </button>
                          <button
                            type="button"
                            onClick={nextImage}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full"
                          >
                            <ChevronRight className="w-5 h-5" />
                          </button>
                          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                            {currentImageIndex + 1} / {imagePreviews.length}
                          </div>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => removeImage(currentImageIndex)}
                        className="absolute top-2 right-2 p-1 bg-red-500 hover:bg-red-600 text-white rounded-full"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {imagePreviews.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {imagePreviews.map((preview, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => setCurrentImageIndex(index)}
                            className={`flex-shrink-0 w-16 h-16 rounded border-2 overflow-hidden ${
                              index === currentImageIndex ? 'border-[#dd1969]' : 'border-gray-300'
                            }`}
                          >
                            <img
                              src={preview}
                              alt={`Thumb ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                    <label htmlFor="images" className="block">
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-3 text-center cursor-pointer hover:bg-gray-50">
                        <Upload className="w-6 h-6 mx-auto mb-1 text-gray-400" />
                        <p className="text-xs text-gray-600">Add more images</p>
                      </div>
                    </label>
                  </div>
                ) : (
                  <label htmlFor="images" className="cursor-pointer block text-center">
                    <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm text-gray-600">Drop multiple images here to upload (or click)</p>
                    <p className="text-xs text-gray-500 mt-1">Upload multiple images for carousel display</p>
                  </label>
                )}
                <input
                  id="images"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImagesChange}
                  className="hidden"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <RichTextEditor
                value={formData.description || ''}
                onChange={(value) => setFormData({ ...formData, description: value })}
                placeholder="Brief description of the event"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="event_type">Event Type *</Label>
                <select
                  id="event_type"
                  value={formData.event_type}
                  onChange={(e) => {
                    const selectedSlug = e.target.value
                    const selectedType = contentTypes.find(t => t.slug === selectedSlug)
                    console.log('Selected slug:', selectedSlug)
                    console.log('Found type:', selectedType)
                    console.log('Type ID:', selectedType?.id)
                    console.log('Type Color:', selectedType?.color)
                    setFormData({
                      ...formData,
                      event_type: selectedSlug,
                      type_id: selectedType?.id || ''
                    })
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b1554]"
                  required
                >
                  <option value="">Select event type...</option>
                  {contentTypes.map((type) => (
                    <option key={type.id} value={type.slug}>
                      {type.name}
                    </option>
                  ))}
                </select>
                {formData.type_id && (
                  <p className="text-xs text-gray-500">
                    Type ID: {formData.type_id}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <select
                  id="timezone"
                  value={formData.timezone}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b1554]"
                >
                  <option value="America/New_York">Eastern (ET)</option>
                  <option value="America/Chicago">Central (CT)</option>
                  <option value="America/Denver">Mountain (MT)</option>
                  <option value="America/Los_Angeles">Pacific (PT)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">Start Date & Time *</Label>
                <Input
                  id="start_date"
                  type="datetime-local"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_date">End Date & Time *</Label>
                <Input
                  id="end_date"
                  type="datetime-local"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  required
                />
              </div>
            </div>

            {/* Recurring Event Section */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <Label htmlFor="is_recurring">Recurring Event</Label>
                  <p className="text-xs text-gray-500">Event repeats on a schedule</p>
                </div>
                <Switch
                  id="is_recurring"
                  checked={formData.is_recurring}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_recurring: checked })}
                />
              </div>

              {formData.is_recurring && (
                <div className="space-y-4 pl-4 border-l-2 border-gray-200">
                  <div className="space-y-2">
                    <Label htmlFor="recurrence_rule">Recurrence Pattern *</Label>
                    <select
                      id="recurrence_rule"
                      value={formData.recurrence_rule}
                      onChange={(e) => setFormData({ ...formData, recurrence_rule: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b1554]"
                      required={formData.is_recurring}
                    >
                      <option value="">Select pattern...</option>
                      <option value="FREQ=DAILY">Daily</option>
                      <option value="FREQ=WEEKLY">Weekly</option>
                      <option value="FREQ=WEEKLY;INTERVAL=2">Every 2 Weeks</option>
                      <option value="FREQ=MONTHLY">Monthly</option>
                      <option value="FREQ=WEEKLY;BYDAY=MO">Every Monday</option>
                      <option value="FREQ=WEEKLY;BYDAY=TU">Every Tuesday</option>
                      <option value="FREQ=WEEKLY;BYDAY=WE">Every Wednesday</option>
                      <option value="FREQ=WEEKLY;BYDAY=TH">Every Thursday</option>
                      <option value="FREQ=WEEKLY;BYDAY=FR">Every Friday</option>
                      <option value="FREQ=MONTHLY;BYDAY=1MO">First Monday of Month</option>
                      <option value="FREQ=MONTHLY;BYDAY=1TU">First Tuesday of Month</option>
                      <option value="FREQ=MONTHLY;BYDAY=1WE">First Wednesday of Month</option>
                      <option value="FREQ=MONTHLY;BYDAY=1TH">First Thursday of Month</option>
                      <option value="FREQ=MONTHLY;BYDAY=1FR">First Friday of Month</option>
                    </select>
                    <p className="text-xs text-gray-500">How often does this event repeat?</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="recurrence_end_date">Series End Date (Optional)</Label>
                    <Input
                      id="recurrence_end_date"
                      type="datetime-local"
                      value={formData.recurrence_end_date}
                      onChange={(e) => setFormData({ ...formData, recurrence_end_date: e.target.value })}
                    />
                    <p className="text-xs text-gray-500">Leave blank for ongoing series</p>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-4">
                <Label htmlFor="is_virtual">Virtual Event</Label>
                <Switch
                  id="is_virtual"
                  checked={formData.is_virtual}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_virtual: checked })}
                />
              </div>

              {formData.is_virtual ? (
                <div className="space-y-2">
                  <Label htmlFor="meeting_url">Meeting URL (Zoom, Teams, etc.)</Label>
                  <Input
                    id="meeting_url"
                    value={formData.meeting_url}
                    onChange={(e) => setFormData({ ...formData, meeting_url: e.target.value })}
                    placeholder="https://zoom.us/..."
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="location">Physical Location</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="Address or venue name"
                  />
                </div>
              )}
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold text-gray-900 mb-4">Registration</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="registration_url">Registration URL</Label>
                  <Input
                    id="registration_url"
                    value={formData.registration_url}
                    onChange={(e) => setFormData({ ...formData, registration_url: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold text-gray-900 mb-4">Display Settings</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="is_featured">Featured</Label>
                  <Switch
                    id="is_featured"
                    checked={formData.is_featured}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_featured: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="is_published">Published</Label>
                  <Switch
                    id="is_published"
                    checked={formData.is_published}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_published: checked })}
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold text-gray-900 mb-4">Visibility Settings</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <MultiSelect
                    label="Choose User Role *"
                    options={[
                      { label: 'Loan Officer', value: 'loan_officer' },
                      { label: 'Broker Owner', value: 'broker_owner' },
                      { label: 'Loan Officer Assistant', value: 'loan_officer_assistant' },
                      { label: 'Processor', value: 'processor' },
                      { label: 'Partner Lender', value: 'partner_lender' },
                      { label: 'Partner Vendor', value: 'partner_vendor' },
                    ]}
                    value={formData.user_role_access}
                    onChange={(value) => setFormData({ ...formData, user_role_access: value })}
                    placeholder="Select roles (required)"
                  />
                </div>

                <div className="space-y-2">
                  <MultiSelect
                    label="Choose User Plan *"
                    options={[
                      { label: 'None', value: 'None' },
                      { label: 'Premium Guest', value: 'Premium Guest' },
                      { label: 'Premium', value: 'Premium' },
                      { label: 'Elite', value: 'Elite' },
                      { label: 'VIP', value: 'VIP' },
                      { label: 'Premium Processor', value: 'Premium Processor' },
                      { label: 'Elite Processor', value: 'Elite Processor' },
                      { label: 'VIP Processor', value: 'VIP Processor' },
                    ]}
                    value={formData.required_plan_tier}
                    onChange={(value) => setFormData({ ...formData, required_plan_tier: value })}
                    placeholder="Select plans (required)"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tags">Tags</Label>
                  <TagsMultiSelect
                    availableTags={tags}
                    selectedTagIds={formData.tag_ids}
                    onChange={(tagIds) => setFormData({ ...formData, tag_ids: tagIds })}
                    placeholder="Select tags to improve searchability..."
                  />
                  <p className="text-xs text-gray-500">Add tags to improve searchability for this event</p>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 bg-[#dd1969] hover:bg-[#c01559]"
              >
                {isSubmitting ? 'Saving...' : editingEvent ? 'Update Event' : 'Create Event'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this event. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BulkTaggingModal
        open={bulkTaggingOpen}
        onOpenChange={setBulkTaggingOpen}
        selectedIds={Array.from(selectedItems)}
        availableTags={tags}
        entityType="event"
        onComplete={handleBulkTagComplete}
      />
    </div>
  )
}
