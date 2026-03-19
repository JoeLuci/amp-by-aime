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
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { MultiSelect } from '@/components/ui/multi-select'
import { Switch } from '@/components/ui/switch'
import { TagsMultiSelect } from '@/components/ui/tags-multi-select'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
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
import { CopyLinkButton } from '@/components/ui/copy-link-button'

interface Tag {
  id: string
  name: string
  slug: string
}

interface Vendor {
  id: string
  name: string
  slug: string
  company_name?: string
  logo_url?: string
  images?: string[]
  description?: string
  website_url?: string
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  vendor_category?: string
  category_id?: string
  category?: Category
  features?: string[]
  pricing_info?: string
  display_order?: number
  type_id?: string
  is_core_partner: boolean
  is_affiliate: boolean
  is_active: boolean
  show_connect_button: boolean
  user_role_access?: string[]
  required_plan_tier?: string[]
  created_at: string
  updated_at?: string
  created_by?: string
  creator_name?: string
}

interface Category {
  id: string
  name: string
  slug: string
  color?: string
}

interface ContentType {
  id: string
  name: string
  slug: string
}

interface VendorsTableProps {
  vendors: Vendor[]
  categories: Category[]
  contentTypes: ContentType[]
  tags: Tag[]
}

export function VendorsTable({ vendors, categories, contentTypes, tags }: VendorsTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchTerm, setSearchTerm] = useState('')

  // Get unique company names for autocomplete
  const existingCompanyNames = Array.from(
    new Set(
      vendors
        .map(v => v.company_name)
        .filter((name): name is string => !!name && name.trim() !== '')
    )
  ).sort()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string>('')
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [vendorToDelete, setVendorToDelete] = useState<string | null>(null)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [bulkTaggingOpen, setBulkTaggingOpen] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    company_name: '',
    logo_url: '',
    images: [] as string[],
    description: '',
    website_url: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    vendor_category: '',
    category_id: '',
    features: '',
    pricing_info: '',
    display_order: 0,
    type_id: '',
    is_core_partner: false,
    is_affiliate: false,
    is_active: true,
    show_connect_button: true,
    user_role_access: [] as string[],
    required_plan_tier: [] as string[],
    tag_ids: [] as string[],
  })

  // Handle opening editor from URL parameter (e.g., from search results)
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (editId) {
      const vendorToEdit = vendors.find(v => v.id === editId)
      if (vendorToEdit) {
        handleOpenDialog(vendorToEdit)
        // Clean up the URL parameter
        router.replace('/admin/vendors', { scroll: false })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const filteredVendors = vendors.filter((vendor) => {
    const searchLower = searchTerm.toLowerCase()
    return (
      vendor.name?.toLowerCase().includes(searchLower) ||
      vendor.vendor_category?.toLowerCase().includes(searchLower) ||
      vendor.contact_email?.toLowerCase().includes(searchLower)
    )
  })

  // Apply sorting to filtered data
  const { items: sortedVendors, requestSort, sortConfig } = useSortableData(filteredVendors)

  // Pagination
  const totalPages = Math.ceil(sortedVendors.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedVendors = sortedVendors.slice(startIndex, endIndex)

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
    if (selectedItems.size === paginatedVendors.length) {
      setSelectedItems(new Set())
    } else {
      setSelectedItems(new Set(paginatedVendors.map(v => v.id)))
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

  const handleOpenDialog = async (vendor?: Vendor) => {
    if (vendor) {
      setEditingVendor(vendor)

      // Fetch vendor tags
      const supabase = createClient()
      const { data: vendorTags } = await supabase
        .from('vendor_tags')
        .select('tag_id')
        .eq('vendor_id', vendor.id)

      setFormData({
        name: vendor.name,
        slug: vendor.slug,
        company_name: vendor.company_name || '',
        logo_url: vendor.logo_url || '',
        images: vendor.images || [],
        description: vendor.description || '',
        website_url: vendor.website_url || '',
        contact_name: vendor.contact_name || '',
        contact_email: vendor.contact_email || '',
        contact_phone: vendor.contact_phone || '',
        vendor_category: vendor.vendor_category || '',
        category_id: vendor.category_id || '',
        features: vendor.features?.join(', ') || '',
        pricing_info: vendor.pricing_info || '',
        display_order: vendor.display_order || 0,
        type_id: vendor.type_id || '',
        is_core_partner: vendor.is_core_partner,
        is_affiliate: vendor.is_affiliate,
        is_active: vendor.is_active,
        show_connect_button: vendor.show_connect_button ?? true,
        user_role_access: vendor.user_role_access || [],
        required_plan_tier: vendor.required_plan_tier || [],
        tag_ids: vendorTags?.map(vt => vt.tag_id) || [],
      })
      setLogoPreview(vendor.logo_url || '')
      setImagePreviews(vendor.images || [])
    } else {
      setEditingVendor(null)
      setFormData({
        name: '',
        slug: '',
        company_name: '',
        logo_url: '',
        images: [],
        description: '',
        website_url: '',
        contact_name: '',
        contact_email: '',
        contact_phone: '',
        vendor_category: '',
        category_id: '',
        features: '',
        pricing_info: '',
        display_order: 0,
        type_id: '',
        is_core_partner: false,
        is_affiliate: false,
        is_active: true,
        show_connect_button: true,
        user_role_access: [],
        required_plan_tier: [],
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
        const filePath = `vendor-logos/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('vendor-logos')
          .upload(filePath, logoFile)

        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage
          .from('vendor-logos')
          .getPublicUrl(filePath)

        logoUrl = publicUrl
      }

      // Upload images if new files selected
      let imageUrls = [...formData.images]
      if (imageFiles.length > 0) {
        const uploadPromises = imageFiles.map(async (file) => {
          const fileExt = file.name.split('.').pop()
          const fileName = `${Math.random()}.${fileExt}`
          const filePath = `vendor-logos/carousel/${fileName}`

          const { error: uploadError } = await supabase.storage
            .from('vendor-logos')
            .upload(filePath, file)

          if (uploadError) throw uploadError

          const { data: { publicUrl } } = supabase.storage
            .from('vendor-logos')
            .getPublicUrl(filePath)

          return publicUrl
        })

        const uploadedUrls = await Promise.all(uploadPromises)
        imageUrls = [...imageUrls, ...uploadedUrls]
      }

      // Convert comma-separated string to array
      const features = formData.features
        ? formData.features.split(',').map((s) => s.trim()).filter(Boolean)
        : []

      // Derive boolean flags from the selected vendor tier (type_id)
      const selectedType = contentTypes.find(t => t.id === formData.type_id)
      const derivedIsCorePartner = selectedType?.slug === 'core-vendor-partner'
      const derivedIsAffiliate = selectedType?.slug === 'affiliates'

      const dataToSave = {
        name: formData.name,
        slug: formData.slug,
        company_name: formData.company_name || null,
        logo_url: logoUrl || null,
        images: imageUrls.length > 0 ? imageUrls : null,
        description: formData.description || null,
        website_url: formData.website_url || null,
        contact_name: formData.contact_name || null,
        contact_email: formData.contact_email || null,
        contact_phone: formData.contact_phone || null,
        vendor_category: formData.vendor_category || null,
        category_id: formData.category_id || null,
        features,
        pricing_info: formData.pricing_info || null,
        display_order: formData.display_order,
        type_id: formData.type_id || null,
        is_core_partner: formData.type_id ? derivedIsCorePartner : formData.is_core_partner,
        is_affiliate: formData.type_id ? derivedIsAffiliate : formData.is_affiliate,
        is_active: formData.is_active,
        show_connect_button: formData.show_connect_button,
        user_role_access: formData.user_role_access.length > 0 ? formData.user_role_access : null,
        required_plan_tier: formData.required_plan_tier.length > 0 ? formData.required_plan_tier : null,
      }

      let vendorId = editingVendor?.id
      const wasActive = editingVendor?.is_active
      const isNowActive = dataToSave.is_active

      if (editingVendor) {
        const { error } = await supabase
          .from('vendors')
          .update(dataToSave)
          .eq('id', editingVendor.id)

        if (error) throw error
      } else {
        // Get current user ID for creator tracking
        const { data: { user } } = await supabase.auth.getUser()

        const { data: newVendor, error } = await supabase.from('vendors').insert([{
          ...dataToSave,
          created_by: user?.id
        }]).select('id').single()

        if (error) throw error
        vendorId = newVendor?.id
      }

      // Send notification if vendor is being activated (new or updated to active)
      if (isNowActive && (!editingVendor || !wasActive)) {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          const notificationTitle = `New Market Partner: ${formData.name}`
          const notificationMessage = `${formData.name} is now available in the marketplace. Check out their services and solutions!`

          await supabase.rpc('create_notification_for_users', {
            p_title: notificationTitle,
            p_message: notificationMessage,
            p_notification_type: 'info',
            p_target_roles: formData.user_role_access.length > 0 ? formData.user_role_access : null,
            p_target_plan_tiers: formData.required_plan_tier.length > 0 ? formData.required_plan_tier : null,
            p_content_type: 'vendor',
            p_content_id: vendorId,
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
      if (vendorId) {
        // Delete existing tags
        await supabase.from('vendor_tags').delete().eq('vendor_id', vendorId)

        // Insert new tags
        if (formData.tag_ids.length > 0) {
          const tagInserts = formData.tag_ids.map(tag_id => ({
            vendor_id: vendorId,
            tag_id
          }))
          await supabase.from('vendor_tags').insert(tagInserts)
        }
      }

      toast.success('Vendor saved successfully!')
      router.refresh()
      window.location.reload()
      setIsDialogOpen(false)
    } catch (error: any) {
      console.error('Error saving vendor:', error)
      toast.error(error.message || 'Failed to save vendor. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteClick = (vendorId: string) => {
    setVendorToDelete(vendorId)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!vendorToDelete) return

    try {
      const supabase = createClient()
      const { error } = await supabase.from('vendors').delete().eq('id', vendorToDelete)

      if (error) throw error

      toast.success('Vendor deleted successfully')
      setDeleteDialogOpen(false)
      setVendorToDelete(null)
      router.refresh()
      window.location.reload()
    } catch (error) {
      console.error('Error deleting vendor:', error)
      toast.error('Failed to delete vendor. Please try again.')
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md">
      <div className="p-6 border-b border-gray-200">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <Input
            placeholder="Search vendors..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full md:max-w-md"
          />
          <Button
            onClick={() => handleOpenDialog()}
            className="bg-[#dd1969] hover:bg-[#c01559] whitespace-nowrap"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Vendor
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
                  checked={paginatedVendors.length > 0 && selectedItems.size === paginatedVendors.length}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all"
                />
              </th>
              <SortableTableHeader<Vendor>
                label="Name"
                sortKey="name"
                currentSortKey={sortConfig?.key as keyof Vendor}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
              />
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <SortableTableHeader<Vendor>
                label="Created By"
                sortKey="creator_name"
                currentSortKey={sortConfig?.key as keyof Vendor}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
              />
              <SortableTableHeader<Vendor>
                label="Created At"
                sortKey="created_at"
                currentSortKey={sortConfig?.key as keyof Vendor}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
              />
              <SortableTableHeader<Vendor>
                label="Status"
                sortKey="is_active"
                currentSortKey={sortConfig?.key as keyof Vendor}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
              />
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedVendors.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  No vendors found
                </td>
              </tr>
            ) : (
              paginatedVendors.map((vendor) => (
                <tr key={vendor.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4">
                    <Checkbox
                      checked={selectedItems.has(vendor.id)}
                      onCheckedChange={() => toggleSelectItem(vendor.id)}
                      aria-label={`Select ${vendor.name}`}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{vendor.name}</div>
                    <div className="text-sm text-gray-500">{vendor.slug}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {vendor.category ? (
                      <Badge style={{ backgroundColor: vendor.category.color || '#6b7280' }} className="text-white">
                        {vendor.category.name}
                      </Badge>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{vendor.creator_name || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      Created: {new Date(vendor.created_at).toLocaleDateString()}
                    </div>
                    {vendor.updated_at && (
                      <div className="text-sm text-gray-500">
                        Updated: {new Date(vendor.updated_at).toLocaleDateString()}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-wrap gap-1">
                      <Badge className={vendor.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                        {vendor.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      {vendor.is_core_partner && (
                        <Badge className="bg-purple-100 text-purple-800">Core</Badge>
                      )}
                      {vendor.is_affiliate && (
                        <Badge className="bg-blue-100 text-blue-800">Affiliate</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <CopyLinkButton
                        path={`/dashboard/market/${vendor.slug}`}
                        label="Copy vendor link"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(vendor)}
                        className="text-blue-600 hover:text-blue-900 hover:bg-blue-50"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(vendor.id)}
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
              Showing <span className="font-semibold">{startIndex + 1}-{Math.min(endIndex, filteredVendors.length)}</span> of{' '}
              <span className="font-semibold">{filteredVendors.length}</span> vendors
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
            <DialogTitle>{editingVendor ? 'Edit Vendor' : 'Add New Vendor'}</DialogTitle>
            <DialogDescription>
              {editingVendor ? 'Update vendor information' : 'Create a new vendor partner'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Product Name *</Label>
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
                  placeholder="e.g. Berman Media PD"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="company_name">Company Name</Label>
                <Input
                  id="company_name"
                  list="company-names-list"
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  placeholder="Select or type new company..."
                />
                <datalist id="company-names-list">
                  {existingCompanyNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
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
                placeholder="Enter vendor description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="website_url">Website URL</Label>
                <Input
                  id="website_url"
                  value={formData.website_url}
                  onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category_id">Category</Label>
                <select
                  id="category_id"
                  value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b1554]"
                >
                  <option value="">Select category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold text-gray-900 mb-4">Contact Information</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="contact_name">Contact Name</Label>
                  <Input
                    id="contact_name"
                    value={formData.contact_name}
                    onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contact_email">Contact Email</Label>
                    <Input
                      id="contact_email"
                      type="email"
                      value={formData.contact_email}
                      onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contact_phone">Contact Phone</Label>
                    <Input
                      id="contact_phone"
                      type="tel"
                      value={formData.contact_phone}
                      onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold text-gray-900 mb-4">Additional Details</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="features">Features (comma-separated)</Label>
                  <Input
                    id="features"
                    value={formData.features}
                    onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                    placeholder="Feature 1, Feature 2, Feature 3"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pricing_info">Pricing Info</Label>
                  <Input
                    id="pricing_info"
                    value={formData.pricing_info}
                    onChange={(e) => setFormData({ ...formData, pricing_info: e.target.value })}
                    placeholder="e.g. Starting at $99/month"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type_id">Vendor Tier</Label>
                  <select
                    id="type_id"
                    value={formData.type_id}
                    onChange={(e) => setFormData({ ...formData, type_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#dd1969]"
                  >
                    <option value="">Select Tier</option>
                    {contentTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
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

                <div className="flex items-center justify-between">
                  <Label htmlFor="is_active">Active</Label>
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="show_connect_button">Show Connect Button</Label>
                  <Switch
                    id="show_connect_button"
                    checked={formData.show_connect_button}
                    onCheckedChange={(checked) => setFormData({ ...formData, show_connect_button: checked })}
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
                {isSubmitting ? 'Saving...' : editingVendor ? 'Update Vendor' : 'Create Vendor'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the vendor
              from the database.
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
        entityType="vendor"
        onComplete={handleBulkTagComplete}
      />
    </div>
  )
}
