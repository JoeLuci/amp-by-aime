'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Edit, Trash2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface Category {
  id: string
  name: string
  slug: string
  description?: string
  content_area: 'resources' | 'market' | 'lenders' | 'events'
  color?: string
  display_order: number
  is_active: boolean
  created_at: string
  created_by?: string
  creator?: {
    id: string
    full_name: string
    email: string
  } | null
}

interface CategoriesManagerProps {
  categories: Category[]
}

export function CategoriesManager({ categories: initialCategories }: CategoriesManagerProps) {
  const router = useRouter()
  const [categories, setCategories] = useState(initialCategories)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedArea, setSelectedArea] = useState<string>('all')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<string | null>(null)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    content_area: 'resources' as 'resources' | 'market' | 'lenders' | 'events',
    color: '#6b7280',
    is_active: true,
  })

  const handleOpenDialog = (category?: Category) => {
    if (category) {
      setEditingCategory(category)
      setFormData({
        name: category.name,
        slug: category.slug,
        description: category.description || '',
        content_area: category.content_area,
        color: category.color || '#6b7280',
        is_active: category.is_active,
      })
    } else {
      setEditingCategory(null)
      // Default to current tab if not 'all', otherwise 'resources'
      const defaultArea = selectedArea !== 'all'
        ? selectedArea as 'resources' | 'market' | 'lenders' | 'events'
        : 'resources'

      setFormData({
        name: '',
        slug: '',
        description: '',
        content_area: defaultArea,
        color: '#6b7280',
        is_active: true,
      })
    }
    setIsDialogOpen(true)
  }

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
  }

  const handleNameChange = (name: string) => {
    setFormData({
      ...formData,
      name,
      slug: generateSlug(name),
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const supabase = createClient()

    try {
      if (editingCategory) {
        // Update existing category
        const { error } = await supabase
          .from('categories')
          .update(formData)
          .eq('id', editingCategory.id)

        if (error) {
          console.error('Supabase update error:', error)
          throw new Error(error.message || 'Failed to update category')
        }
      } else {
        // Get current user for created_by
        const { data: { user } } = await supabase.auth.getUser()

        // Try to create new category with created_by, fallback to without if field doesn't exist
        let insertData: any = { ...formData }
        if (user?.id) {
          insertData.created_by = user.id
        }

        const { error } = await supabase
          .from('categories')
          .insert([insertData])

        if (error) {
          // If error is because created_by doesn't exist, try without it
          if (error.message?.includes('created_by') || error.code === '42703') {
            const { error: retryError } = await supabase
              .from('categories')
              .insert([formData])

            if (retryError) {
              console.error('Supabase insert retry error:', retryError)
              throw new Error(retryError.message || 'Failed to create category')
            }
          } else {
            console.error('Supabase insert error:', error)
            throw new Error(error.message || 'Failed to create category')
          }
        }
      }

      setIsDialogOpen(false)
      router.refresh()
      window.location.reload()
    } catch (error: any) {
      console.error('Error saving category:', error)
      toast.error(error.message || 'Failed to save category. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteClick = (categoryId: string) => {
    setItemToDelete(categoryId)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return

    const supabase = createClient()

    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', itemToDelete)

      if (error) throw error

      setDeleteDialogOpen(false)
      setItemToDelete(null)
      router.refresh()
      window.location.reload()
    } catch (error) {
      console.error('Error deleting category:', error)
      toast.error('Failed to delete category. Please try again.')
    }
  }

  const toggleActive = async (category: Category) => {
    const supabase = createClient()

    try {
      const { error } = await supabase
        .from('categories')
        .update({ is_active: !category.is_active })
        .eq('id', category.id)

      if (error) throw error

      router.refresh()
      window.location.reload()
    } catch (error) {
      console.error('Error updating category:', error)
      toast.error('Failed to update category. Please try again.')
    }
  }

  // Filter categories by selected area
  const filteredCategories = selectedArea === 'all'
    ? categories
    : categories.filter(c => c.content_area === selectedArea)

  // Pagination calculations
  const totalItems = filteredCategories.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedCategories = filteredCategories.slice(startIndex, endIndex)

  // Reset to page 1 when filter changes
  const handleAreaChange = (area: string) => {
    setSelectedArea(area)
    setCurrentPage(1)
  }

  const contentAreaColors: Record<string, string> = {
    resources: 'bg-blue-100 text-blue-800',
    events: 'bg-purple-100 text-purple-800',
    market: 'bg-green-100 text-green-800',
    lenders: 'bg-orange-100 text-orange-800',
  }

  return (
    <div className="space-y-4">
      {/* Header with Filters and Add Button */}
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <Button
            variant={selectedArea === 'all' ? 'default' : 'outline'}
            onClick={() => handleAreaChange('all')}
            size="sm"
          >
            All ({categories.length})
          </Button>
          <Button
            variant={selectedArea === 'resources' ? 'default' : 'outline'}
            onClick={() => handleAreaChange('resources')}
            size="sm"
          >
            Resources ({categories.filter(c => c.content_area === 'resources').length})
          </Button>
          <Button
            variant={selectedArea === 'market' ? 'default' : 'outline'}
            onClick={() => handleAreaChange('market')}
            size="sm"
          >
            Market ({categories.filter(c => c.content_area === 'market').length})
          </Button>
          <Button
            variant={selectedArea === 'lenders' ? 'default' : 'outline'}
            onClick={() => handleAreaChange('lenders')}
            size="sm"
          >
            Lenders ({categories.filter(c => c.content_area === 'lenders').length})
          </Button>
          <Button
            variant={selectedArea === 'events' ? 'default' : 'outline'}
            onClick={() => handleAreaChange('events')}
            size="sm"
          >
            Events ({categories.filter(c => c.content_area === 'events').length})
          </Button>
        </div>
        <Button
          onClick={() => handleOpenDialog()}
          className="bg-[#dd1969] hover:bg-[#c01559]"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Category
        </Button>
      </div>

      {/* Categories Table */}
      <div className="bg-white rounded-lg shadow">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Content Area</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Created By</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedCategories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                  No categories found. Create your first category!
                </TableCell>
              </TableRow>
            ) : (
              paginatedCategories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell>
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                      {category.slug}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge className={contentAreaColors[category.content_area]}>
                      {category.content_area}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {category.color ? (
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded border"
                          style={{ backgroundColor: category.color }}
                        />
                        <span className="text-sm text-gray-600">{category.color}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {category.description || '-'}
                  </TableCell>
                  <TableCell className="text-gray-600">
                    {category.creator?.full_name || <span className="text-gray-500">System</span>}
                  </TableCell>
                  <TableCell>
                    <button onClick={() => toggleActive(category)}>
                      <Badge
                        className={
                          category.is_active
                            ? 'bg-green-100 text-green-800 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                        }
                      >
                        {category.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(category)}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(category.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination Controls */}
        {totalItems > 0 && (
          <div className="flex items-center justify-between px-4 py-4 border-t">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>Showing {startIndex + 1}-{Math.min(endIndex, totalItems)} of {totalItems}</span>
              <Select
                value={itemsPerPage.toString()}
                onValueChange={(value) => {
                  setItemsPerPage(Number(value))
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="w-[70px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <span>per page</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="h-8 w-8 p-0"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-3 text-sm">
                Page {currentPage} of {totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages}
                className="h-8 w-8 p-0"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingCategory ? 'Edit Category' : 'Add New Category'}
              </DialogTitle>
              <DialogDescription>
                {editingCategory
                  ? 'Update the category information below.'
                  : 'Create a new category for organizing content.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g., Technology, Marketing"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Slug *</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="e.g., technology, marketing"
                  required
                />
                <p className="text-xs text-gray-500">
                  URL-friendly version (auto-generated from name)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="content_area">Content Area *</Label>
                <select
                  id="content_area"
                  value={formData.content_area}
                  onChange={(e: any) => setFormData({ ...formData, content_area: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#dd1969]"
                  required
                >
                  <option value="resources">Resources</option>
                  <option value="market">Market</option>
                  <option value="lenders">Lenders</option>
                  <option value="events">Events</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="color">Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-20 h-10"
                  />
                  <Input
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    placeholder="#6b7280"
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of this category"
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="is_active">
                  Active (visible to users)
                </Label>
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-[#dd1969] hover:bg-[#c01559]"
              >
                {isSubmitting ? 'Saving...' : editingCategory ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this category. This action cannot be undone.
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
    </div>
  )
}
