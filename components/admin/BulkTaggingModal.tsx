'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { TagsMultiSelect } from '@/components/ui/tags-multi-select'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Tag, Plus, Minus } from 'lucide-react'

interface TagType {
  id: string
  name: string
  slug: string
}

interface BulkTaggingModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedIds: string[]
  availableTags: TagType[]
  entityType: 'resource' | 'vendor' | 'lender' | 'event'
  onComplete: () => void
}

export function BulkTaggingModal({
  open,
  onOpenChange,
  selectedIds,
  availableTags,
  entityType,
  onComplete,
}: BulkTaggingModalProps) {
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [mode, setMode] = useState<'add' | 'remove' | 'replace'>('add')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setSelectedTagIds([])
      setMode('add')
    }
  }, [open])

  const getJunctionTableName = () => {
    switch (entityType) {
      case 'resource':
        return 'resource_tags'
      case 'vendor':
        return 'vendor_tags'
      case 'lender':
        return 'lender_tags'
      case 'event':
        return 'event_tags'
    }
  }

  const getIdColumnName = () => {
    switch (entityType) {
      case 'resource':
        return 'resource_id'
      case 'vendor':
        return 'vendor_id'
      case 'lender':
        return 'lender_id'
      case 'event':
        return 'event_id'
    }
  }

  const handleSubmit = async () => {
    if (selectedTagIds.length === 0) {
      toast.error('Please select at least one tag')
      return
    }

    setIsSubmitting(true)
    const supabase = createClient()
    const junctionTable = getJunctionTableName()
    const idColumn = getIdColumnName()

    try {
      for (const entityId of selectedIds) {
        if (mode === 'replace') {
          // Delete all existing tags for this entity
          await supabase.from(junctionTable).delete().eq(idColumn, entityId)
        }

        if (mode === 'remove') {
          // Delete only the selected tags
          for (const tagId of selectedTagIds) {
            await supabase
              .from(junctionTable)
              .delete()
              .eq(idColumn, entityId)
              .eq('tag_id', tagId)
          }
        } else {
          // Add or replace - insert the selected tags
          const tagInserts = selectedTagIds.map((tagId) => ({
            [idColumn]: entityId,
            tag_id: tagId,
          }))

          // Use upsert to avoid duplicates when adding
          const { error } = await supabase
            .from(junctionTable)
            .upsert(tagInserts, {
              onConflict: `${idColumn},tag_id`,
              ignoreDuplicates: true,
            })

          if (error) throw error
        }
      }

      const actionText = mode === 'add' ? 'added to' : mode === 'remove' ? 'removed from' : 'set for'
      toast.success(`Tags ${actionText} ${selectedIds.length} ${entityType}${selectedIds.length > 1 ? 's' : ''}`)
      onOpenChange(false)
      onComplete()
    } catch (error) {
      console.error('Error bulk tagging:', error)
      toast.error('Failed to update tags. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-[#dd1969]" />
            Bulk Tag {selectedIds.length} {entityType}{selectedIds.length > 1 ? 's' : ''}
          </DialogTitle>
          <DialogDescription>
            Apply tags to multiple items at once
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Mode Selection */}
          <div className="space-y-2">
            <Label>Action</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === 'add' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('add')}
                className={mode === 'add' ? 'bg-[#dd1969] hover:bg-[#c01559]' : ''}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Tags
              </Button>
              <Button
                type="button"
                variant={mode === 'remove' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('remove')}
                className={mode === 'remove' ? 'bg-[#dd1969] hover:bg-[#c01559]' : ''}
              >
                <Minus className="w-4 h-4 mr-1" />
                Remove Tags
              </Button>
              <Button
                type="button"
                variant={mode === 'replace' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('replace')}
                className={mode === 'replace' ? 'bg-[#dd1969] hover:bg-[#c01559]' : ''}
              >
                Replace All
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              {mode === 'add' && 'Selected tags will be added to existing tags'}
              {mode === 'remove' && 'Selected tags will be removed from items'}
              {mode === 'replace' && 'All existing tags will be replaced with selected tags'}
            </p>
          </div>

          {/* Tag Selection */}
          <div className="space-y-2">
            <Label>Select Tags</Label>
            <TagsMultiSelect
              availableTags={availableTags}
              selectedTagIds={selectedTagIds}
              onChange={setSelectedTagIds}
              placeholder="Choose tags to apply..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || selectedTagIds.length === 0}
            className="bg-[#dd1969] hover:bg-[#c01559]"
          >
            {isSubmitting ? 'Applying...' : `Apply to ${selectedIds.length} Item${selectedIds.length > 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
