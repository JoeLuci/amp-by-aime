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
import { Plus, Edit, Trash2, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface Tag {
  id: string
  name: string
  slug: string
  created_at: string
  created_by?: string
  creator?: {
    id: string
    full_name: string
    email: string
  } | null
}

interface TagsManagerProps {
  tags: Tag[]
}

export function TagsManager({ tags: initialTags }: TagsManagerProps) {
  const router = useRouter()
  const [tags, setTags] = useState(initialTags)
  const [searchTerm, setSearchTerm] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
  })

  const filteredTags = tags.filter((tag) =>
    tag.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tag.slug.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Pagination
  const totalPages = Math.ceil(filteredTags.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedTags = filteredTags.slice(startIndex, endIndex)

  // Reset to page 1 when search changes
  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  const handleOpenDialog = (tag?: Tag) => {
    if (tag) {
      setEditingTag(tag)
      setFormData({
        name: tag.name,
        slug: tag.slug,
      })
    } else {
      setEditingTag(null)
      setFormData({
        name: '',
        slug: '',
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
      name,
      slug: generateSlug(name),
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const supabase = createClient()

    try {
      if (editingTag) {
        // Update existing tag
        const { error } = await supabase
          .from('tags')
          .update(formData)
          .eq('id', editingTag.id)

        if (error) {
          console.error('Supabase update error:', error)
          throw new Error(error.message || 'Failed to update tag')
        }
      } else {
        // Get current user for created_by
        const { data: { user } } = await supabase.auth.getUser()

        // Try to create new tag with created_by, fallback to without if field doesn't exist
        let insertData: any = { ...formData }
        if (user?.id) {
          insertData.created_by = user.id
        }

        const { error } = await supabase
          .from('tags')
          .insert([insertData])

        if (error) {
          // If error is because created_by doesn't exist, try without it
          if (error.message?.includes('created_by') || error.code === '42703') {
            const { error: retryError } = await supabase
              .from('tags')
              .insert([formData])

            if (retryError) {
              console.error('Supabase insert retry error:', retryError)
              throw new Error(retryError.message || 'Failed to create tag')
            }
          } else {
            console.error('Supabase insert error:', error)
            throw new Error(error.message || 'Failed to create tag')
          }
        }
      }

      setIsDialogOpen(false)
      router.refresh()
      window.location.reload()
    } catch (error: any) {
      console.error('Error saving tag:', error)
      toast.error(error.message || 'Failed to save tag. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteClick = (tagId: string) => {
    setItemToDelete(tagId)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return

    const supabase = createClient()

    try {
      const { error } = await supabase
        .from('tags')
        .delete()
        .eq('id', itemToDelete)

      if (error) throw error

      setDeleteDialogOpen(false)
      setItemToDelete(null)
      router.refresh()
      window.location.reload()
    } catch (error) {
      console.error('Error deleting tag:', error)
      toast.error('Failed to delete tag. Please try again.')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className="space-y-4">
      {/* Header with Search and Add Button */}
      <div className="flex justify-between items-center gap-4">
        <div className="flex-1 max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            type="text"
            placeholder="Search tags..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          onClick={() => handleOpenDialog()}
          className="bg-[#dd1969] hover:bg-[#c01559]"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Tag
        </Button>
      </div>

      {/* Tags Table */}
      <div className="bg-white rounded-lg shadow">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Created By</TableHead>
              <TableHead>Created Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedTags.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                  {searchTerm ? 'No tags match your search.' : 'No tags found. Create your first tag!'}
                </TableCell>
              </TableRow>
            ) : (
              paginatedTags.map((tag) => (
                <TableRow key={tag.id}>
                  <TableCell className="font-medium">
                    <Badge variant="secondary" className="bg-gray-100 text-gray-800">
                      {tag.name}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                      {tag.slug}
                    </code>
                  </TableCell>
                  <TableCell className="text-gray-600">
                    {tag.creator?.full_name || <span className="text-gray-500">System</span>}
                  </TableCell>
                  <TableCell className="text-gray-600">
                    {formatDate(tag.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(tag)}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(tag.id)}
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
      </div>

      {/* Pagination Controls */}
      {filteredTags.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing <span className="font-semibold">{startIndex + 1}</span> to{' '}
            <span className="font-semibold">{Math.min(endIndex, filteredTags.length)}</span> of{' '}
            <span className="font-semibold">{filteredTags.length}</span> tags
          </div>

          {totalPages > 1 && (
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

              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((page) => {
                    return (
                      page === 1 ||
                      page === totalPages ||
                      Math.abs(page - currentPage) <= 1
                    )
                  })
                  .map((page, index, array) => {
                    const prevPage = array[index - 1]
                    return (
                      <div key={page} className="flex items-center">
                        {prevPage && page - prevPage > 1 && (
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
          )}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editingTag ? 'Edit Tag' : 'Add New Tag'}</DialogTitle>
              <DialogDescription>
                {editingTag
                  ? 'Update the tag information below.'
                  : 'Create a new tag for filtering content.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Tag Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g., Featured, Popular, New"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Slug *</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="e.g., featured, popular, new"
                  required
                />
                <p className="text-xs text-gray-500">
                  URL-friendly version (auto-generated from name)
                </p>
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
                {isSubmitting ? 'Saving...' : editingTag ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this tag. This action cannot be undone.
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
