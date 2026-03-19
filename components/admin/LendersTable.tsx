'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Edit, Trash2, Plus, Upload, X, ChevronLeft, ChevronRight, Tag, Link2 } from 'lucide-react'
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

interface Category {
  id: string
  name: string
  slug: string
  color?: string
}

interface Lender {
  id: string
  name: string
  slug: string
  logo_url?: string
  images?: string[]
  description?: string
  website_url?: string
  escalations_contact_name?: string
  escalations_contact_email?: string
  escalations_contact_phone?: string
  connections_contact_name?: string
  connections_contact_email?: string
  connections_contact_phone?: string
  states_served?: string[]
  features?: string[]
  products?: string[]
  display_order?: number
  is_featured: boolean
  is_active: boolean
  user_role_access?: string[]
  required_plan_tier?: string[]
  type_id?: string
  category_id?: string
  type?: any
  category?: any
  created_at: string
  updated_at?: string
  created_by?: string
  creator_name?: string
}

interface LendersTableProps {
  lenders: Lender[]
  categories: Category[]
  tags: Tag[]
}

export function LendersTable({ lenders, categories, tags }: LendersTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchTerm, setSearchTerm] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingLender, setEditingLender] = useState<Lender | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string>('')
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
    name: '',
    slug: '',
    logo_url: '',
    images: [] as string[],
    description: '',
    website_url: '',
    escalations_contact_name: '',
    escalations_contact_email: '',
    escalations_contact_phone: '',
    connections_contact_name: '',
    connections_contact_email: '',
    connections_contact_phone: '',
    states_served: [] as string[],
    features: '',
    products: '',
    display_order: 0,
    is_featured: false,
    is_active: true,
    user_role_access: [] as string[],
    required_plan_tier: [] as string[],
    category_id: '',
    tag_ids: [] as string[],
  })

  // Handle opening editor from URL parameter (e.g., from search results)
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (editId) {
      const lenderToEdit = lenders.find(l => l.id === editId)
      if (lenderToEdit) {
        handleOpenDialog(lenderToEdit)
        // Clean up the URL parameter
        router.replace('/admin/lenders', { scroll: false })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const filteredLenders = lenders.filter((lender) => {
    const searchLower = searchTerm.toLowerCase()
    return (
      lender.name?.toLowerCase().includes(searchLower) ||
      lender.escalations_contact_email?.toLowerCase().includes(searchLower) ||
      lender.connections_contact_email?.toLowerCase().includes(searchLower)
    )
  })

  // Apply sorting to filtered data
  const { items: sortedLenders, requestSort, sortConfig } = useSortableData(filteredLenders)

  // Pagination
  const totalPages = Math.ceil(sortedLenders.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedLenders = sortedLenders.slice(startIndex, endIndex)

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
    if (selectedItems.size === paginatedLenders.length) {
      setSelectedItems(new Set())
    } else {
      setSelectedItems(new Set(paginatedLenders.map(l => l.id)))
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

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setLogoFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setLogoPreview(reader.result as string)
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

  const handleOpenDialog = async (lender?: Lender) => {
    if (lender) {
      setEditingLender(lender)

      // Fetch lender tags
      const supabase = createClient()
      const { data: lenderTags } = await supabase
        .from('lender_tags')
        .select('tag_id')
        .eq('lender_id', lender.id)

      setFormData({
        name: lender.name,
        slug: lender.slug,
        logo_url: lender.logo_url || '',
        images: lender.images || [],
        description: lender.description || '',
        website_url: lender.website_url || '',
        escalations_contact_name: lender.escalations_contact_name || '',
        escalations_contact_email: lender.escalations_contact_email || '',
        escalations_contact_phone: lender.escalations_contact_phone || '',
        connections_contact_name: lender.connections_contact_name || '',
        connections_contact_email: lender.connections_contact_email || '',
        connections_contact_phone: lender.connections_contact_phone || '',
        states_served: lender.states_served || [],
        features: lender.features?.join(', ') || '',
        products: lender.products?.join(', ') || '',
        display_order: lender.display_order || 0,
        is_featured: lender.is_featured,
        is_active: lender.is_active,
        user_role_access: lender.user_role_access || [],
        required_plan_tier: lender.required_plan_tier || [],
        category_id: lender.category_id || '',
        tag_ids: lenderTags?.map(lt => lt.tag_id) || [],
      })
      setLogoPreview(lender.logo_url || '')
      setImagePreviews(lender.images || [])
    } else {
      setEditingLender(null)
      setFormData({
        name: '',
        slug: '',
        logo_url: '',
        images: [],
        description: '',
        website_url: '',
        escalations_contact_name: '',
        escalations_contact_email: '',
        escalations_contact_phone: '',
        connections_contact_name: '',
        connections_contact_email: '',
        connections_contact_phone: '',
        states_served: [],
        features: '',
        products: '',
        display_order: 0,
        is_featured: false,
        is_active: true,
        user_role_access: [],
        required_plan_tier: [],
        category_id: '',
        tag_ids: [],
      })
      setLogoPreview('')
      setImagePreviews([])
    }
    setLogoFile(null)
    setImageFiles([])
    setCurrentImageIndex(0)
    setIsDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!formData.name || !formData.slug) {
      toast.error('Please fill in required fields (Name and Slug)')
      return
    }

    setIsSubmitting(true)

    try {
      const supabase = createClient()
      let logoUrl = formData.logo_url

      // Upload logo if new file selected
      if (logoFile) {
        const fileExt = logoFile.name.split('.').pop()
        const fileName = `${Math.random()}.${fileExt}`
        const filePath = `lender-logos/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('lender-logos')
          .upload(filePath, logoFile)

        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage
          .from('lender-logos')
          .getPublicUrl(filePath)

        logoUrl = publicUrl
      }

      // Upload images if new files selected
      let imageUrls = [...formData.images]
      if (imageFiles.length > 0) {
        const uploadPromises = imageFiles.map(async (file) => {
          const fileExt = file.name.split('.').pop()
          const fileName = `${Math.random()}.${fileExt}`
          const filePath = `lender-logos/carousel/${fileName}`

          const { error: uploadError } = await supabase.storage
            .from('lender-logos')
            .upload(filePath, file)

          if (uploadError) throw uploadError

          const { data: { publicUrl } } = supabase.storage
            .from('lender-logos')
            .getPublicUrl(filePath)

          return publicUrl
        })

        const uploadedUrls = await Promise.all(uploadPromises)
        imageUrls = [...imageUrls, ...uploadedUrls]
      }

      // Convert comma-separated strings to arrays
      const features = formData.features
        ? formData.features.split(',').map((s) => s.trim()).filter(Boolean)
        : []
      const products = formData.products
        ? formData.products.split(',').map((s) => s.trim()).filter(Boolean)
        : []

      const dataToSave = {
        name: formData.name,
        slug: formData.slug,
        logo_url: logoUrl || null,
        images: imageUrls.length > 0 ? imageUrls : null,
        description: formData.description || null,
        website_url: formData.website_url || null,
        escalations_contact_name: formData.escalations_contact_name || null,
        escalations_contact_email: formData.escalations_contact_email || null,
        escalations_contact_phone: formData.escalations_contact_phone || null,
        connections_contact_name: formData.connections_contact_name || null,
        connections_contact_email: formData.connections_contact_email || null,
        connections_contact_phone: formData.connections_contact_phone || null,
        states_served: formData.states_served.length > 0 ? formData.states_served : null,
        features,
        products,
        display_order: formData.display_order,
        is_featured: formData.is_featured,
        is_active: formData.is_active,
        user_role_access: formData.user_role_access.length > 0 ? formData.user_role_access : null,
        required_plan_tier: formData.required_plan_tier.length > 0 ? formData.required_plan_tier : null,
        category_id: formData.category_id || null,
      }

      let lenderId = editingLender?.id
      const wasActive = editingLender?.is_active
      const isNowActive = dataToSave.is_active

      if (editingLender) {
        const { error } = await supabase
          .from('lenders')
          .update(dataToSave)
          .eq('id', editingLender.id)

        if (error) throw error
      } else {
        // Get current user ID for creator tracking
        const { data: { user } } = await supabase.auth.getUser()

        const { data: newLender, error } = await supabase.from('lenders').insert([{
          ...dataToSave,
          created_by: user?.id
        }]).select('id').single()

        if (error) throw error
        lenderId = newLender?.id
      }

      // Send notification if lender is being activated (new or updated to active)
      if (isNowActive && (!editingLender || !wasActive)) {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          const notificationTitle = `New Lender: ${formData.name}`
          const notificationMessage = `${formData.name} is now available. Explore their lending products and programs!`

          await supabase.rpc('create_notification_for_users', {
            p_title: notificationTitle,
            p_message: notificationMessage,
            p_notification_type: 'info',
            p_target_roles: formData.user_role_access.length > 0 ? formData.user_role_access : null,
            p_target_plan_tiers: formData.required_plan_tier.length > 0 ? formData.required_plan_tier : null,
            p_content_type: 'lender',
            p_content_id: lenderId,
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
      if (lenderId) {
        // Delete existing tags
        await supabase.from('lender_tags').delete().eq('lender_id', lenderId)

        // Insert new tags
        if (formData.tag_ids.length > 0) {
          const tagInserts = formData.tag_ids.map(tag_id => ({
            lender_id: lenderId,
            tag_id
          }))
          await supabase.from('lender_tags').insert(tagInserts)
        }
      }

      toast.success('Lender saved successfully!')
      router.refresh()
      window.location.reload()
      setIsDialogOpen(false)
    } catch (error: any) {
      console.error('Error saving lender:', error)
      toast.error(error.message || 'Failed to save lender. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteClick = (lenderId: string) => {
    setItemToDelete(lenderId)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return

    try {
      const supabase = createClient()
      const { error } = await supabase.from('lenders').delete().eq('id', itemToDelete)

      if (error) throw error

      toast.success('Lender deleted successfully')
      setDeleteDialogOpen(false)
      setItemToDelete(null)
      router.refresh()
      window.location.reload()
    } catch (error) {
      console.error('Error deleting lender:', error)
      toast.error('Failed to delete lender. Please try again.')
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md">
      <div className="p-6 border-b border-gray-200">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <Input
            placeholder="Search lenders..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full md:max-w-md"
          />
          <Button
            onClick={() => handleOpenDialog()}
            className="bg-[#dd1969] hover:bg-[#c01559] whitespace-nowrap"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Lender
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
                  checked={paginatedLenders.length > 0 && selectedItems.size === paginatedLenders.length}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all"
                />
              </th>
              <SortableTableHeader<Lender>
                label="Name"
                sortKey="name"
                currentSortKey={sortConfig?.key as keyof Lender}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
              />
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <SortableTableHeader<Lender>
                label="Created By"
                sortKey="creator_name"
                currentSortKey={sortConfig?.key as keyof Lender}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
              />
              <SortableTableHeader<Lender>
                label="Created At"
                sortKey="created_at"
                currentSortKey={sortConfig?.key as keyof Lender}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
              />
              <SortableTableHeader<Lender>
                label="Status"
                sortKey="is_active"
                currentSortKey={sortConfig?.key as keyof Lender}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
              />
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedLenders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  No lenders found
                </td>
              </tr>
            ) : (
              paginatedLenders.map((lender) => (
                <tr key={lender.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4">
                    <Checkbox
                      checked={selectedItems.has(lender.id)}
                      onCheckedChange={() => toggleSelectItem(lender.id)}
                      aria-label={`Select ${lender.name}`}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{lender.name}</div>
                    <div className="text-sm text-gray-500">{lender.slug}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {lender.category ? (
                      <Badge style={{ backgroundColor: lender.category.color || '#6b7280' }} className="text-white">
                        {lender.category.name}
                      </Badge>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{lender.creator_name || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      Created: {new Date(lender.created_at).toLocaleDateString()}
                    </div>
                    {lender.updated_at && (
                      <div className="text-sm text-gray-500">
                        Updated: {new Date(lender.updated_at).toLocaleDateString()}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge className={lender.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                      {lender.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    {lender.is_featured && (
                      <Badge className="ml-2 bg-yellow-100 text-yellow-800">Featured</Badge>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <CopyLinkButton
                        path={`/dashboard/lenders/${lender.slug}`}
                        label="Copy lender link"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(lender)}
                        className="text-blue-600 hover:text-blue-900 hover:bg-blue-50"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(lender.id)}
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
              Showing <span className="font-semibold">{startIndex + 1}-{Math.min(endIndex, filteredLenders.length)}</span> of{' '}
              <span className="font-semibold">{filteredLenders.length}</span> lenders
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
            <DialogTitle>{editingLender ? 'Edit Lender' : 'Add New Lender'}</DialogTitle>
            <DialogDescription>
              {editingLender ? 'Update lender information' : 'Create a new lender partner'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => {
                    const name = e.target.value
                    const slug = name
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/(^-|-$)/g, '')
                    setFormData({ ...formData, name, slug })
                  }}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Slug *</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="auto-generated-from-name"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category_id">Category</Label>
              <select
                id="category_id"
                value={formData.category_id}
                onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#dd1969]"
              >
                <option value="">Select Category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <TagsMultiSelect
                availableTags={tags}
                selectedTagIds={formData.tag_ids}
                onChange={(tagIds) => setFormData({ ...formData, tag_ids: tagIds })}
                placeholder="Select tags to improve searchability..."
              />
            </div>

            <div className="space-y-2">
              <Label>Logo</Label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                {logoPreview ? (
                  <div className="relative">
                    <img src={logoPreview} alt="Logo preview" className="w-full h-48 object-contain rounded" />
                    <button
                      type="button"
                      onClick={() => {
                        setLogoFile(null)
                        setLogoPreview('')
                        setFormData({ ...formData, logo_url: '' })
                      }}
                      className="absolute top-2 right-2 p-1 bg-red-500 hover:bg-red-600 text-white rounded-full"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label htmlFor="logo" className="cursor-pointer block text-center">
                    <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm text-gray-600">Click to upload logo</p>
                    <p className="text-xs text-gray-500 mt-1">PNG, JPG up to 5MB</p>
                  </label>
                )}
                <input
                  id="logo"
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
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
                placeholder="Enter lender description"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="website_url">Website URL</Label>
              <Input
                id="website_url"
                value={formData.website_url}
                onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                placeholder="https://..."
              />
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold text-gray-900 mb-4">Escalations Contact</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="escalations_contact_name">Contact Name</Label>
                  <Input
                    id="escalations_contact_name"
                    value={formData.escalations_contact_name}
                    onChange={(e) => setFormData({ ...formData, escalations_contact_name: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="escalations_contact_email">Contact Email</Label>
                    <Input
                      id="escalations_contact_email"
                      type="email"
                      value={formData.escalations_contact_email}
                      onChange={(e) => setFormData({ ...formData, escalations_contact_email: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="escalations_contact_phone">Contact Phone</Label>
                    <Input
                      id="escalations_contact_phone"
                      type="tel"
                      value={formData.escalations_contact_phone}
                      onChange={(e) => setFormData({ ...formData, escalations_contact_phone: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold text-gray-900 mb-4">Connections Contact</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="connections_contact_name">Contact Name</Label>
                  <Input
                    id="connections_contact_name"
                    value={formData.connections_contact_name}
                    onChange={(e) => setFormData({ ...formData, connections_contact_name: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="connections_contact_email">Contact Email</Label>
                    <Input
                      id="connections_contact_email"
                      type="email"
                      value={formData.connections_contact_email}
                      onChange={(e) => setFormData({ ...formData, connections_contact_email: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="connections_contact_phone">Contact Phone</Label>
                    <Input
                      id="connections_contact_phone"
                      type="tel"
                      value={formData.connections_contact_phone}
                      onChange={(e) => setFormData({ ...formData, connections_contact_phone: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold text-gray-900 mb-4">Additional Details</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <MultiSelect
                    label="States Served"
                    options={[
                      { label: 'Alabama', value: 'AL' },
                      { label: 'Alaska', value: 'AK' },
                      { label: 'Arizona', value: 'AZ' },
                      { label: 'Arkansas', value: 'AR' },
                      { label: 'California', value: 'CA' },
                      { label: 'Colorado', value: 'CO' },
                      { label: 'Connecticut', value: 'CT' },
                      { label: 'Delaware', value: 'DE' },
                      { label: 'Florida', value: 'FL' },
                      { label: 'Georgia', value: 'GA' },
                      { label: 'Hawaii', value: 'HI' },
                      { label: 'Idaho', value: 'ID' },
                      { label: 'Illinois', value: 'IL' },
                      { label: 'Indiana', value: 'IN' },
                      { label: 'Iowa', value: 'IA' },
                      { label: 'Kansas', value: 'KS' },
                      { label: 'Kentucky', value: 'KY' },
                      { label: 'Louisiana', value: 'LA' },
                      { label: 'Maine', value: 'ME' },
                      { label: 'Maryland', value: 'MD' },
                      { label: 'Massachusetts', value: 'MA' },
                      { label: 'Michigan', value: 'MI' },
                      { label: 'Minnesota', value: 'MN' },
                      { label: 'Mississippi', value: 'MS' },
                      { label: 'Missouri', value: 'MO' },
                      { label: 'Montana', value: 'MT' },
                      { label: 'Nebraska', value: 'NE' },
                      { label: 'Nevada', value: 'NV' },
                      { label: 'New Hampshire', value: 'NH' },
                      { label: 'New Jersey', value: 'NJ' },
                      { label: 'New Mexico', value: 'NM' },
                      { label: 'New York', value: 'NY' },
                      { label: 'North Carolina', value: 'NC' },
                      { label: 'North Dakota', value: 'ND' },
                      { label: 'Ohio', value: 'OH' },
                      { label: 'Oklahoma', value: 'OK' },
                      { label: 'Oregon', value: 'OR' },
                      { label: 'Pennsylvania', value: 'PA' },
                      { label: 'Rhode Island', value: 'RI' },
                      { label: 'South Carolina', value: 'SC' },
                      { label: 'South Dakota', value: 'SD' },
                      { label: 'Tennessee', value: 'TN' },
                      { label: 'Texas', value: 'TX' },
                      { label: 'Utah', value: 'UT' },
                      { label: 'Vermont', value: 'VT' },
                      { label: 'Virginia', value: 'VA' },
                      { label: 'Washington', value: 'WA' },
                      { label: 'West Virginia', value: 'WV' },
                      { label: 'Wisconsin', value: 'WI' },
                      { label: 'Wyoming', value: 'WY' },
                      { label: 'Washington DC', value: 'DC' },
                    ]}
                    value={formData.states_served}
                    onChange={(value) => setFormData({ ...formData, states_served: value })}
                    placeholder="Select states"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="products">Products (comma-separated)</Label>
                  <Input
                    id="products"
                    value={formData.products}
                    onChange={(e) => setFormData({ ...formData, products: e.target.value })}
                    placeholder="Conventional, FHA, VA, USDA"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="features">Features (comma-separated)</Label>
                  <Input
                    id="features"
                    value={formData.features}
                    onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                    placeholder="Fast turnaround, Competitive rates"
                  />
                </div>

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
                    <Label htmlFor="is_active">Active</Label>
                    <Switch
                      id="is_active"
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                    />
                  </div>
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
                {isSubmitting ? 'Saving...' : editingLender ? 'Update Lender' : 'Create Lender'}
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
              This will permanently delete this lender. This action cannot be undone.
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
        entityType="lender"
        onComplete={handleBulkTagComplete}
      />
    </div>
  )
}
