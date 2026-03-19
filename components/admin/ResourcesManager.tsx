'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { MultiSelect } from '@/components/ui/multi-select'
import { Switch } from '@/components/ui/switch'
import { TagsMultiSelect } from '@/components/ui/tags-multi-select'
import { Plus, Edit, Trash2, Upload, X, ChevronLeft, ChevronRight, Search, Tag, ArrowUpDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CopyLinkButton } from '@/components/ui/copy-link-button'
import { BulkTaggingModal } from './BulkTaggingModal'
import { ResourceReorderModal } from './ResourceReorderModal'
import { Checkbox } from '@/components/ui/checkbox'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { toast } from 'sonner'

interface Tag {
  id: string
  name: string
  slug: string
}

interface Resource {
  id: string
  title: string
  slug: string
  sub_title?: string
  description?: string
  resource_type: string
  category_id?: string
  thumbnail_url?: string
  content_images?: string[]
  file_url?: string
  key_points?: string[]
  is_featured: boolean
  is_published: boolean
  user_role_access?: string[]
  required_plan_tier?: string[]
  created_at: string
  updated_at?: string
  created_by?: string
  creator_name?: string
  display_order?: number
}

interface Category {
  id: string
  name: string
  slug: string
}

interface ContentType {
  id: string
  name: string
  slug: string
  color: string
}

interface ResourcesManagerProps {
  resources: Resource[]
  categories: Category[]
  contentTypes: ContentType[]
  tags: Tag[]
}

export function ResourcesManager({ resources: initialResources, categories, contentTypes, tags }: ResourcesManagerProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [resources, setResources] = useState(initialResources)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedType, setSelectedType] = useState<string>('all')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingResource, setEditingResource] = useState<Resource | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null)
  const [thumbnailPreview, setThumbnailPreview] = useState<string>('')
  const [contentImageFiles, setContentImageFiles] = useState<File[]>([])
  const [contentImagePreviews, setContentImagePreviews] = useState<string[]>([])
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaFileName, setMediaFileName] = useState<string>('')
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<string | null>(null)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [bulkTaggingOpen, setBulkTaggingOpen] = useState(false)
  const [reorderModalOpen, setReorderModalOpen] = useState(false)

  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    sub_title: '',
    description: '',
    resource_type: 'video',
    category_id: '',
    thumbnail_url: '',
    content_images: [] as string[],
    file_url: '',
    key_points: [] as string[],
    is_featured: false,
    is_published: true,
    user_role_access: [] as string[],
    required_plan_tier: [] as string[],
    tag_ids: [] as string[],
  })

  const [currentKeyPoint, setCurrentKeyPoint] = useState('')

  // Handle opening editor from URL parameter (e.g., from search results)
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (editId) {
      const resourceToEdit = resources.find(r => r.id === editId)
      if (resourceToEdit) {
        handleOpenDialog(resourceToEdit)
        // Clean up the URL parameter
        router.replace('/admin/resources', { scroll: false })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const filteredResources = resources.filter((resource) => {
    // Search filter
    const matchesSearch = searchTerm === '' ||
      resource.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      resource.sub_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      resource.description?.toLowerCase().includes(searchTerm.toLowerCase())

    // Category filter
    const matchesCategory = selectedCategory === 'all' || resource.category_id === selectedCategory

    // Type filter
    const matchesType = selectedType === 'all' || resource.resource_type === selectedType

    return matchesSearch && matchesCategory && matchesType
  })

  // Apply sorting to filtered data
  const { items: sortedResources, requestSort, sortConfig } = useSortableData(filteredResources)

  // Pagination
  const totalPages = Math.ceil(sortedResources.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedResources = sortedResources.slice(startIndex, endIndex)

  // Reset to page 1 when filters change
  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value)
    setCurrentPage(1)
  }

  const handleTypeChange = (value: string) => {
    setSelectedType(value)
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
    if (selectedItems.size === paginatedResources.length) {
      setSelectedItems(new Set())
    } else {
      setSelectedItems(new Set(paginatedResources.map(r => r.id)))
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

  const handleReorderSave = () => {
    router.refresh()
    window.location.reload()
  }

  const handleOpenDialog = async (resource?: Resource) => {
    if (resource) {
      setEditingResource(resource)

      // Fetch resource tags
      const supabase = createClient()
      const { data: resourceTags } = await supabase
        .from('resource_tags')
        .select('tag_id')
        .eq('resource_id', resource.id)

      setFormData({
        title: resource.title,
        slug: resource.slug,
        sub_title: resource.sub_title || '',
        description: resource.description || '',
        resource_type: resource.resource_type,
        category_id: resource.category_id || '',
        thumbnail_url: resource.thumbnail_url || '',
        content_images: resource.content_images || [],
        file_url: resource.file_url || '',
        key_points: resource.key_points || [],
        is_featured: resource.is_featured,
        is_published: resource.is_published,
        user_role_access: resource.user_role_access || [],
        required_plan_tier: resource.required_plan_tier || [],
        tag_ids: resourceTags?.map(rt => rt.tag_id) || [],
      })
      setThumbnailPreview(resource.thumbnail_url || '')
      setContentImagePreviews(resource.content_images || [])
      // If editing and has file_url, show it as the current file
      if (resource.file_url) {
        setMediaFileName('')  // Will show the URL instead
      }
    } else {
      setEditingResource(null)
      setFormData({
        title: '',
        slug: '',
        sub_title: '',
        description: '',
        resource_type: 'video',
        category_id: '',
        thumbnail_url: '',
        content_images: [],
        file_url: '',
        key_points: [],
        is_featured: false,
        is_published: true,
        user_role_access: [],
        required_plan_tier: [],
        tag_ids: [],
      })
      setThumbnailPreview('')
      setContentImagePreviews([])
      setMediaFileName('')
    }
    setThumbnailFile(null)
    setContentImageFiles([])
    setMediaFile(null)
    setCurrentImageIndex(0)
    setIsDialogOpen(true)
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

  const handleContentImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      setContentImageFiles(prev => [...prev, ...files])

      files.forEach(file => {
        const reader = new FileReader()
        reader.onloadend = () => {
          setContentImagePreviews(prev => [...prev, reader.result as string])
        }
        reader.readAsDataURL(file)
      })
    }
  }

  const handleMediaFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setMediaFile(file)
      setMediaFileName(file.name)
    }
  }

  const removeMediaFile = () => {
    setMediaFile(null)
    setMediaFileName('')
  }

  const removeContentImage = (index: number) => {
    setContentImageFiles(prev => prev.filter((_, i) => i !== index))
    setContentImagePreviews(prev => {
      const newPreviews = prev.filter((_, i) => i !== index)
      if (currentImageIndex >= newPreviews.length && newPreviews.length > 0) {
        setCurrentImageIndex(newPreviews.length - 1)
      }
      return newPreviews
    })
    // Also remove from formData if it's an existing URL
    setFormData(prev => ({
      ...prev,
      content_images: prev.content_images.filter((_, i) => i !== index)
    }))
  }

  const nextImage = () => {
    setCurrentImageIndex((prev) =>
      prev === contentImagePreviews.length - 1 ? 0 : prev + 1
    )
  }

  const previousImage = () => {
    setCurrentImageIndex((prev) =>
      prev === 0 ? contentImagePreviews.length - 1 : prev - 1
    )
  }

  const handleAddKeyPoint = () => {
    if (currentKeyPoint.trim()) {
      setFormData({
        ...formData,
        key_points: [...formData.key_points, currentKeyPoint.trim()],
      })
      setCurrentKeyPoint('')
    }
  }

  const handleRemoveKeyPoint = (index: number) => {
    setFormData({
      ...formData,
      key_points: formData.key_points.filter((_, i) => i !== index),
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const supabase = createClient()

    try {
      let thumbnailUrl = formData.thumbnail_url

      // Upload thumbnail if new file selected
      if (thumbnailFile) {
        const fileExt = thumbnailFile.name.split('.').pop()
        const fileName = `${Math.random()}.${fileExt}`
        const filePath = `resources/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('resources')
          .upload(filePath, thumbnailFile)

        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage
          .from('resources')
          .getPublicUrl(filePath)

        thumbnailUrl = publicUrl
      }

      // Upload content images if new files selected
      let contentImageUrls = [...formData.content_images]
      if (contentImageFiles.length > 0) {
        const uploadPromises = contentImageFiles.map(async (file) => {
          const fileExt = file.name.split('.').pop()
          const fileName = `${Math.random()}.${fileExt}`
          const filePath = `resources/content/${fileName}`

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
        contentImageUrls = [...contentImageUrls, ...uploadedUrls]
      }

      // Upload media file (audio/video) if selected
      let fileUrl = formData.file_url
      if (mediaFile) {
        const fileExt = mediaFile.name.split('.').pop()
        const fileName = `${Math.random()}.${fileExt}`
        const filePath = `resources/media/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('resources')
          .upload(filePath, mediaFile, {
            cacheControl: '3600',
            upsert: false
          })

        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage
          .from('resources')
          .getPublicUrl(filePath)

        fileUrl = publicUrl
      }

      // Don't include tag_ids in the resources table - it's handled separately via junction table
      const { tag_ids, ...resourceData } = formData

      const dataToSave = {
        ...resourceData,
        thumbnail_url: thumbnailUrl,
        content_images: contentImageUrls.length > 0 ? contentImageUrls : null,
        file_url: fileUrl,
        category_id: formData.category_id || null,
        user_role_access: formData.user_role_access.length > 0 ? formData.user_role_access : null,
        required_plan_tier: formData.required_plan_tier.length > 0 ? formData.required_plan_tier : null,
      }

      let resourceId = editingResource?.id
      const wasPublished = editingResource?.is_published
      const isNowPublished = dataToSave.is_published

      if (editingResource) {
        // Update existing resource
        const { error } = await supabase
          .from('resources')
          .update(dataToSave)
          .eq('id', editingResource.id)

        if (error) throw error
      } else {
        // Create new resource - get current user ID
        const { data: { user } } = await supabase.auth.getUser()

        const { data: newResource, error } = await supabase.from('resources').insert([{
          ...dataToSave,
          created_by: user?.id
        }]).select('id').single()

        if (error) throw error
        resourceId = newResource?.id
      }

      // Send notification if resource is being published (new or updated to published)
      if (isNowPublished && (!editingResource || !wasPublished)) {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          const notificationTitle = `New Resource: ${formData.title}`
          const notificationMessage = `${formData.sub_title || formData.title} is now available. Click to view this new resource!`

          await supabase.rpc('create_notification_for_users', {
            p_title: notificationTitle,
            p_message: notificationMessage,
            p_notification_type: 'info',
            p_target_roles: formData.user_role_access.length > 0 ? formData.user_role_access : null,
            p_target_plan_tiers: formData.required_plan_tier.length > 0 ? formData.required_plan_tier : null,
            p_content_type: 'resource',
            p_content_id: resourceId,
            p_scheduled_at: null,
            p_expires_at: null,
            p_created_by: user?.id,
          })
        } catch (notifError) {
          console.error('Error sending notification:', notifError)
          // Don't fail the whole operation if notification fails
        }
      }

      // Handle tags
      if (resourceId) {
        // Delete existing tags
        await supabase.from('resource_tags').delete().eq('resource_id', resourceId)

        // Insert new tags
        if (formData.tag_ids.length > 0) {
          const tagInserts = formData.tag_ids.map(tag_id => ({
            resource_id: resourceId,
            tag_id
          }))
          await supabase.from('resource_tags').insert(tagInserts)
        }
      }

      setIsDialogOpen(false)

      // Refresh the page to show updated data
      router.refresh()

      // Force reload to ensure fresh data
      window.location.reload()
    } catch (error: any) {
      console.error('Error saving resource:', error)
      const errorMessage = error?.message || error?.error_description || JSON.stringify(error) || 'Unknown error'
      toast.error(`Failed to save resource: ${errorMessage}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteClick = (resourceId: string) => {
    setItemToDelete(resourceId)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return

    const supabase = createClient()

    try {
      // First get the resource to extract file URLs
      const { data: resource } = await supabase
        .from('resources')
        .select('thumbnail_url, content_images')
        .eq('id', itemToDelete)
        .single()

      // Delete thumbnail from storage if exists
      if (resource?.thumbnail_url) {
        try {
          // Extract the file path from the URL
          const url = new URL(resource.thumbnail_url)
          const pathParts = url.pathname.split('/')
          const fileName = pathParts[pathParts.length - 1]
          const filePath = `resources/${fileName}`

          await supabase.storage.from('resources').remove([filePath])
        } catch (storageError) {
          console.warn('Error deleting thumbnail from storage:', storageError)
        }
      }

      // Delete content images from storage if exist
      if (resource?.content_images && resource.content_images.length > 0) {
        try {
          const paths = resource.content_images.map((imageUrl: string) => {
            const url = new URL(imageUrl)
            const pathParts = url.pathname.split('/')
            const fileName = pathParts[pathParts.length - 1]
            return `resources/content/${fileName}`
          })

          await supabase.storage.from('resources').remove(paths)
        } catch (storageError) {
          console.warn('Error deleting content images from storage:', storageError)
        }
      }

      // Then delete the database record
      const { error } = await supabase.from('resources').delete().eq('id', itemToDelete)

      if (error) throw error

      setDeleteDialogOpen(false)
      setItemToDelete(null)
      router.refresh()
      window.location.reload()
    } catch (error) {
      console.error('Error deleting resource:', error)
      toast.error('Failed to delete resource. Please try again.')
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md">
      {/* Search, Filter and Add Button */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex flex-col gap-4">
          {/* Search and Add Button Row */}
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex-1 max-w-md relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Search resources by title, subtitle, or description..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setReorderModalOpen(true)}
                className="whitespace-nowrap"
              >
                <ArrowUpDown className="w-4 h-4 mr-2" />
                Reorder
              </Button>
              <Button
                onClick={() => handleOpenDialog()}
                className="bg-[#dd1969] hover:bg-[#c01559] whitespace-nowrap"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Resource
              </Button>
            </div>
          </div>

          {/* Filter Row */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-gray-700">Type:</span>
            <select
              value={selectedType}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#dd1969]"
            >
              <option value="all">All Types</option>
              {contentTypes.map((type) => (
                <option key={type.id} value={type.slug}>
                  {type.name}
                </option>
              ))}
            </select>
            <span className="text-sm font-medium text-gray-700">Category:</span>
            <select
              value={selectedCategory}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#dd1969]"
            >
              <option value="all">All Categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <span className="text-sm text-gray-600">
              Showing <span className="font-semibold">{filteredResources.length}</span> of{' '}
              <span className="font-semibold">{resources.length}</span> resources
            </span>
          </div>

          {/* Bulk Actions Bar */}
          {selectedItems.size > 0 && (
            <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
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
      </div>

      {/* Resources Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left">
                <Checkbox
                  checked={paginatedResources.length > 0 && selectedItems.size === paginatedResources.length}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all"
                />
              </th>
              <SortableTableHeader<Resource>
                label="Resource"
                sortKey="title"
                currentSortKey={sortConfig?.key as keyof Resource}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
              />
              <SortableTableHeader<Resource>
                label="Type"
                sortKey="resource_type"
                currentSortKey={sortConfig?.key as keyof Resource}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
              />
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <SortableTableHeader<Resource>
                label="Created By"
                sortKey="creator_name"
                currentSortKey={sortConfig?.key as keyof Resource}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
              />
              <SortableTableHeader<Resource>
                label="Created At"
                sortKey="created_at"
                currentSortKey={sortConfig?.key as keyof Resource}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
              />
              <SortableTableHeader<Resource>
                label="Status"
                sortKey="is_published"
                currentSortKey={sortConfig?.key as keyof Resource}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
              />
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedResources.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                  No resources found
                </td>
              </tr>
            ) : (
              paginatedResources.map((resource) => {
                const category = categories.find(c => c.id === resource.category_id)
                return (
                  <tr key={resource.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <Checkbox
                        checked={selectedItems.has(resource.id)}
                        onCheckedChange={() => toggleSelectItem(resource.id)}
                        aria-label={`Select ${resource.title}`}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        {resource.thumbnail_url && (
                          <div className="relative w-24 h-[54px] mr-3 flex-shrink-0">
                            <Image
                              src={resource.thumbnail_url}
                              alt={resource.title}
                              fill
                              className="object-cover rounded"
                            />
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-medium text-gray-900">{resource.title}</div>
                          {resource.sub_title && (
                            <div className="text-sm text-gray-500 line-clamp-1">{resource.sub_title}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge className="bg-[#1a2547] text-white capitalize">
                        {resource.resource_type}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{category?.name || 'N/A'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{resource.creator_name || 'Unknown'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-xs text-gray-500">
                        <div>Created: {new Date(resource.created_at).toLocaleDateString()}</div>
                        {resource.updated_at && (
                          <div>Updated: {new Date(resource.updated_at).toLocaleDateString()}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        <Badge className={resource.is_published ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                          {resource.is_published ? 'Published' : 'Draft'}
                        </Badge>
                        {resource.is_featured && (
                          <Badge className="bg-yellow-100 text-yellow-800">Featured</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <CopyLinkButton
                          path={`/dashboard/resources/${resource.slug}`}
                          label="Copy resource link"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDialog(resource)}
                          className="text-blue-600 hover:text-blue-900 hover:bg-blue-50"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClick(resource.id)}
                          className="text-red-600 hover:text-red-900 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing <span className="font-semibold">{startIndex + 1}-{Math.min(endIndex, filteredResources.length)}</span> of{' '}
              <span className="font-semibold">{filteredResources.length}</span> resources
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

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingResource ? 'Edit Resource' : 'Add Resource'}
              </DialogTitle>
              <DialogDescription>
                {editingResource ? 'Update resource details.' : 'Create a new resource for users.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Basic Information */}
              <div className="space-y-2">
                <Label htmlFor="resource_type">Resource Type *</Label>
                <select
                  id="resource_type"
                  value={formData.resource_type}
                  onChange={(e) => setFormData({ ...formData, resource_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#dd1969]"
                  required
                >
                  <option value="">Select a type...</option>
                  {contentTypes.map((type) => (
                    <option key={type.id} value={type.slug}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category_id">Product Category</Label>
                <select
                  id="category_id"
                  value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#dd1969]"
                >
                  <option value="">Choose an option</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => {
                    const title = e.target.value
                    const slug = title
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/(^-|-$)/g, '')
                    setFormData({ ...formData, title, slug })
                  }}
                  placeholder="Enter title"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Slug *</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="auto-generated-from-title"
                  required
                />
                <p className="text-xs text-gray-500">URL-friendly version (auto-generated from title)</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sub_title">Sub-Title</Label>
                <Input
                  id="sub_title"
                  value={formData.sub_title}
                  onChange={(e) => setFormData({ ...formData, sub_title: e.target.value })}
                  placeholder="Enter sub-title"
                />
              </div>

              {/* Content Details */}
              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-900 mb-4">Content Details</h3>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="thumbnail">Add Attachment/Thumbnail</Label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                      {thumbnailPreview ? (
                        <div className="relative">
                          <img
                            src={thumbnailPreview}
                            alt="Preview"
                            className="max-h-48 mx-auto rounded"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setThumbnailFile(null)
                              setThumbnailPreview('')
                            }}
                            className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <label htmlFor="thumbnail" className="cursor-pointer block">
                          <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                          <p className="text-sm text-gray-600">Drop files here to upload (or click)</p>
                          <p className="text-xs text-gray-500 mt-1">Upload 1520×418 or similar aspect ratio image</p>
                          <input
                            id="thumbnail"
                            type="file"
                            accept="image/*"
                            onChange={handleThumbnailChange}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Only show content images for article and pdf types */}
                  {['article', 'pdf'].includes(formData.resource_type) && (
                    <div className="space-y-2">
                      <Label htmlFor="contentImages">Content Images (Multiple)</Label>
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                        {contentImagePreviews.length > 0 ? (
                        <div className="space-y-3">
                          {/* Carousel */}
                          <div className="relative">
                            <img
                              src={contentImagePreviews[currentImageIndex]}
                              alt={`Content ${currentImageIndex + 1}`}
                              className="w-full h-64 object-cover rounded"
                            />
                            {contentImagePreviews.length > 1 && (
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
                                  {currentImageIndex + 1} / {contentImagePreviews.length}
                                </div>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => removeContentImage(currentImageIndex)}
                              className="absolute top-2 right-2 p-1 bg-red-500 hover:bg-red-600 text-white rounded-full"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          {/* Thumbnail strip */}
                          {contentImagePreviews.length > 1 && (
                            <div className="flex gap-2 overflow-x-auto pb-2">
                              {contentImagePreviews.map((preview, index) => (
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
                          <label htmlFor="contentImages" className="block">
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-3 text-center cursor-pointer hover:bg-gray-50">
                              <Upload className="w-6 h-6 mx-auto mb-1 text-gray-400" />
                              <p className="text-xs text-gray-600">Add more images</p>
                            </div>
                          </label>
                        </div>
                      ) : (
                        <label htmlFor="contentImages" className="cursor-pointer block text-center">
                          <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                          <p className="text-sm text-gray-600">Drop multiple images here to upload (or click)</p>
                          <p className="text-xs text-gray-500 mt-1">Upload multiple content images for carousel display</p>
                        </label>
                      )}
                      <input
                        id="contentImages"
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleContentImagesChange}
                        className="hidden"
                      />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Key Points</Label>
                    <div className="flex gap-2">
                      <Input
                        value={currentKeyPoint}
                        onChange={(e) => setCurrentKeyPoint(e.target.value)}
                        placeholder="Enter your Key Points"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleAddKeyPoint()
                          }
                        }}
                      />
                      <Button type="button" onClick={handleAddKeyPoint} className="bg-[#dd1969] hover:bg-[#c01559]">
                        Add
                      </Button>
                    </div>
                    {formData.key_points.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {formData.key_points.map((point, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1"
                          >
                            <span className="text-sm">{point}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveKeyPoint(index)}
                              className="text-red-600 hover:text-red-800"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <RichTextEditor
                      value={formData.description || ''}
                      onChange={(value) => setFormData({ ...formData, description: value })}
                      placeholder="Enter resource description"
                    />
                  </div>

                  {/* Show file upload for video/podcast/document/webinar/infographic OR URL input for others */}
                  {['video', 'podcast', 'document', 'webinar', 'infographic'].includes(formData.resource_type) ? (
                    <div className="space-y-2">
                      <Label>
                        {formData.resource_type === 'document'
                          ? 'Document File'
                          : formData.resource_type === 'infographic'
                          ? 'Infographic File'
                          : 'Media File'}
                      </Label>
                      <div className="space-y-3">
                        {/* File Upload Option */}
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                          {mediaFileName || formData.file_url ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                                <div className="flex items-center gap-2">
                                  <Upload className="w-5 h-5 text-gray-600" />
                                  <span className="text-sm font-medium text-gray-900">
                                    {mediaFileName || formData.file_url.split('/').pop()}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    removeMediaFile()
                                    setFormData({ ...formData, file_url: '' })
                                  }}
                                  className="text-red-600 hover:text-red-800"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                              {!mediaFileName && formData.file_url && (
                                <p className="text-xs text-gray-600">Current: {formData.file_url}</p>
                              )}
                            </div>
                          ) : (
                            <label htmlFor="mediaFile" className="cursor-pointer block text-center">
                              <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                              <p className="text-sm text-gray-600">
                                {formData.resource_type === 'document'
                                  ? 'Upload document file'
                                  : formData.resource_type === 'infographic'
                                  ? 'Upload infographic image'
                                  : formData.resource_type === 'webinar'
                                  ? 'Upload webinar recording'
                                  : 'Upload audio or video file'}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                {formData.resource_type === 'document'
                                  ? 'PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX'
                                  : formData.resource_type === 'infographic'
                                  ? 'PNG, JPG, JPEG, SVG, PDF'
                                  : 'MP3, MP4, WAV, OGG, WebM'}
                              </p>
                              <input
                                id="mediaFile"
                                type="file"
                                accept={formData.resource_type === 'document'
                                  ? '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx'
                                  : formData.resource_type === 'infographic'
                                  ? 'image/*,.pdf'
                                  : 'audio/*,video/*'}
                                onChange={handleMediaFileChange}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>

                        {/* Only show OR divider and YouTube option for video/podcast/webinar, not document or infographic */}
                        {!['document', 'infographic'].includes(formData.resource_type) && (
                          <>
                            {/* OR divider */}
                            <div className="relative">
                              <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-gray-300"></div>
                              </div>
                              <div className="relative flex justify-center text-sm">
                                <span className="px-2 bg-white text-gray-500">OR</span>
                              </div>
                            </div>

                            {/* YouTube URL Option */}
                            <div className="space-y-2">
                              <Label htmlFor="file_url">YouTube/Vimeo URL</Label>
                              <Input
                                id="file_url"
                                value={formData.file_url}
                                onChange={(e) => {
                                  setFormData({ ...formData, file_url: e.target.value })
                                  removeMediaFile()
                                }}
                                placeholder="https://youtube.com/watch?v=..."
                                disabled={!!mediaFileName}
                              />
                              <p className="text-xs text-gray-500">
                                Paste a YouTube or Vimeo URL
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="file_url">Resource URL</Label>
                      <Input
                        id="file_url"
                        value={formData.file_url}
                        onChange={(e) => setFormData({ ...formData, file_url: e.target.value })}
                        placeholder="https://..."
                      />
                      <p className="text-xs text-gray-500">
                        PDF/Download: Direct file link • External link: Any URL
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Display Settings */}
              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-900 mb-4">Display Settings</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="is_featured">
                      Mark Resource as Featured
                    </Label>
                    <Switch
                      id="is_featured"
                      checked={formData.is_featured}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_featured: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="is_published">
                      Publish (make visible to users)
                    </Label>
                    <Switch
                      id="is_published"
                      checked={formData.is_published}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_published: checked })}
                    />
                  </div>
                </div>
              </div>

              {/* Visibility Settings */}
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
                    <p className="text-xs text-gray-500">Add tags to improve searchability for this resource</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSubmitting}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 bg-[#dd1969] hover:bg-[#c01559]"
              >
                {isSubmitting ? 'Saving...' : editingResource ? 'Update' : 'Add Resource'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this resource and all associated images. This action cannot be undone.
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
        entityType="resource"
        onComplete={handleBulkTagComplete}
      />

      <ResourceReorderModal
        open={reorderModalOpen}
        onOpenChange={setReorderModalOpen}
        resources={resources}
        onSave={handleReorderSave}
      />
    </div>
  )
}
