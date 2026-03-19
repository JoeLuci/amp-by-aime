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

interface ContentType {
  id: string
  name: string
  slug: string
  content_area: 'resources' | 'market' | 'lenders' | 'events'
  color?: string
  icon?: string
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
  created_by?: string
  creator?: {
    id: string
    full_name: string
    email: string
  } | null
}

interface TypesManagerProps {
  types: ContentType[]
}

export function TypesManager({ types: initialTypes }: TypesManagerProps) {
  const router = useRouter()
  const [types, setTypes] = useState(initialTypes)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingType, setEditingType] = useState<ContentType | null>(null)
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
    content_area: 'resources' as 'resources' | 'market' | 'lenders' | 'events',
    color: '#6b7280',
    icon: '',
    is_active: true,
  })

  const handleOpenDialog = (type?: ContentType) => {
    if (type) {
      setEditingType(type)
      setFormData({
        name: type.name,
        slug: type.slug,
        content_area: type.content_area,
        color: type.color || '#6b7280',
        icon: type.icon || '',
        is_active: type.is_active,
      })
    } else {
      setEditingType(null)
      setFormData({
        name: '',
        slug: '',
        content_area: 'resources',
        color: '#6b7280',
        icon: '',
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
      if (editingType) {
        // Update existing type
        const { error } = await supabase
          .from('content_types')
          .update({
            name: formData.name,
            slug: formData.slug,
            content_area: formData.content_area,
            color: formData.color || null,
            icon: formData.icon || null,
            is_active: formData.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingType.id)

        if (error) throw error
      } else {
        // Get current user for created_by
        const { data: { user } } = await supabase.auth.getUser()

        // Try to create new type with created_by, fallback to without if field doesn't exist
        let insertData: any = {
          name: formData.name,
          slug: formData.slug,
          content_area: formData.content_area,
          color: formData.color || null,
          icon: formData.icon || null,
          is_active: formData.is_active,
        }

        if (user?.id) {
          insertData.created_by = user.id
        }

        const { error } = await supabase.from('content_types').insert(insertData)

        if (error) {
          // If error is because created_by doesn't exist, try without it
          if (error.message?.includes('created_by') || error.code === '42703') {
            const { error: retryError } = await supabase.from('content_types').insert({
              name: formData.name,
              slug: formData.slug,
              content_area: formData.content_area,
              color: formData.color || null,
              icon: formData.icon || null,
              is_active: formData.is_active,
            })

            if (retryError) throw retryError
          } else {
            throw error
          }
        }
      }

      setIsDialogOpen(false)
      router.refresh()
    } catch (error) {
      console.error('Error saving content type:', error)
      toast.error('Failed to save content type')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteClick = (id: string) => {
    setItemToDelete(id)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return

    const supabase = createClient()

    try {
      const { error } = await supabase.from('content_types').delete().eq('id', itemToDelete)

      if (error) throw error

      setTypes(types.filter((t) => t.id !== itemToDelete))
      setDeleteDialogOpen(false)
      setItemToDelete(null)
      router.refresh()
    } catch (error) {
      console.error('Error deleting type:', error)
      toast.error('Failed to delete type')
    }
  }

  const toggleActive = async (type: ContentType) => {
    const supabase = createClient()

    try {
      const { error } = await supabase
        .from('content_types')
        .update({ is_active: !type.is_active })
        .eq('id', type.id)

      if (error) throw error

      router.refresh()
    } catch (error) {
      console.error('Error updating type:', error)
      toast.error('Failed to update type. Please try again.')
    }
  }

  const filteredTypes = selectedArea === 'all'
    ? types
    : types.filter(t => t.content_area === selectedArea)

  // Pagination calculations
  const totalItems = filteredTypes.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedTypes = filteredTypes.slice(startIndex, endIndex)

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
    <div>
      {/* Header with Actions */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-2">
          <Button
            variant={selectedArea === 'all' ? 'default' : 'outline'}
            onClick={() => handleAreaChange('all')}
            size="sm"
          >
            All ({types.length})
          </Button>
          <Button
            variant={selectedArea === 'resources' ? 'default' : 'outline'}
            onClick={() => handleAreaChange('resources')}
            size="sm"
          >
            Resources ({types.filter(t => t.content_area === 'resources').length})
          </Button>
          <Button
            variant={selectedArea === 'market' ? 'default' : 'outline'}
            onClick={() => handleAreaChange('market')}
            size="sm"
          >
            Market ({types.filter(t => t.content_area === 'market').length})
          </Button>
          <Button
            variant={selectedArea === 'lenders' ? 'default' : 'outline'}
            onClick={() => handleAreaChange('lenders')}
            size="sm"
          >
            Lenders ({types.filter(t => t.content_area === 'lenders').length})
          </Button>
          <Button
            variant={selectedArea === 'events' ? 'default' : 'outline'}
            onClick={() => handleAreaChange('events')}
            size="sm"
          >
            Events ({types.filter(t => t.content_area === 'events').length})
          </Button>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="mr-2 h-4 w-4" />
          Add Type
        </Button>
      </div>

      {/* Types Table */}
      <div className="bg-white rounded-lg shadow">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Content Area</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Created By</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedTypes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                  No content types found. Create your first type!
                </TableCell>
              </TableRow>
            ) : (
              paginatedTypes.map((type) => (
                <TableRow key={type.id}>
                  <TableCell className="font-medium">{type.name}</TableCell>
                  <TableCell>
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                      {type.slug}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge className={contentAreaColors[type.content_area]}>
                      {type.content_area}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {type.color ? (
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded border"
                          style={{ backgroundColor: type.color }}
                        />
                        <span className="text-sm text-gray-600">{type.color}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-gray-600">
                    {type.creator?.full_name || <span className="text-gray-500">System</span>}
                  </TableCell>
                  <TableCell>
                    <button onClick={() => toggleActive(type)}>
                      <Badge
                        className={
                          type.is_active
                            ? 'bg-green-100 text-green-800 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                        }
                      >
                        {type.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(type)}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(type.id)}
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingType ? 'Edit Content Type' : 'Add Content Type'}
            </DialogTitle>
            <DialogDescription>
              {editingType
                ? 'Update the content type details below'
                : 'Create a new content type for resources, market, lenders, or events'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g., Video, Podcast, Webinar"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="auto-generated"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content_area">Content Area</Label>
                <Select
                  value={formData.content_area}
                  onValueChange={(value: any) =>
                    setFormData({ ...formData, content_area: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="resources">Resources</SelectItem>
                    <SelectItem value="market">Market</SelectItem>
                    <SelectItem value="lenders">Lenders</SelectItem>
                    <SelectItem value="events">Events</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="color">Color (for Market & Lender tiers)</Label>
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
                <p className="text-xs text-gray-500">
                  Used for badge colors in Market vendor tiers and Lender tiers
                </p>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="is_active">Active</Label>
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_active: checked })
                  }
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : editingType ? 'Update' : 'Create'}
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
              This will permanently delete this type. This action cannot be undone.
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
