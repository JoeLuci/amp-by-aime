'use client'

import { useState, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { GripVertical, Save, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import Image from 'next/image'

interface Resource {
  id: string
  title: string
  slug: string
  resource_type: string
  thumbnail_url?: string
  display_order?: number
}

interface SortableItemProps {
  resource: Resource
  index: number
}

function SortableItem({ resource, index }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: resource.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 bg-white border rounded-lg shadow-sm ${
        isDragging ? 'shadow-lg border-[#dd1969]' : 'border-gray-200'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 rounded"
      >
        <GripVertical className="w-5 h-5 text-gray-400" />
      </button>
      <span className="text-sm font-medium text-gray-500 w-8">#{index + 1}</span>
      {resource.thumbnail_url && (
        <div className="relative w-16 h-9 flex-shrink-0">
          <Image
            src={resource.thumbnail_url}
            alt={resource.title}
            fill
            className="object-cover rounded"
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{resource.title}</p>
      </div>
      <Badge className="bg-[#1a2547] text-white capitalize flex-shrink-0">
        {resource.resource_type}
      </Badge>
    </div>
  )
}

interface ResourceReorderModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  resources: Resource[]
  onSave: () => void
}

export function ResourceReorderModal({
  open,
  onOpenChange,
  resources,
  onSave,
}: ResourceReorderModalProps) {
  // Sort resources by display_order initially
  const sortedInitial = [...resources].sort((a, b) =>
    (a.display_order || 999999) - (b.display_order || 999999)
  )

  const [items, setItems] = useState<Resource[]>(sortedInitial)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Reset items when modal opens with new resources
  const handleOpenChange = useCallback((isOpen: boolean) => {
    if (isOpen) {
      const sorted = [...resources].sort((a, b) =>
        (a.display_order || 999999) - (b.display_order || 999999)
      )
      setItems(sorted)
      setHasChanges(false)
    }
    onOpenChange(isOpen)
  }, [resources, onOpenChange])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id)
        const newIndex = items.findIndex((item) => item.id === over.id)
        setHasChanges(true)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const response = await fetch('/api/resources/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: items.map(item => item.id) }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save order')
      }

      toast.success('Resource order saved successfully')
      setHasChanges(false)
      onSave()
      onOpenChange(false)
    } catch (error: any) {
      console.error('Error saving order:', error)
      toast.error(error.message || 'Failed to save order')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Reorder Resources</DialogTitle>
          <DialogDescription>
            Drag and drop resources to change their display order. Lower positions appear first.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-2 min-h-[300px] max-h-[50vh]">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
              {items.map((resource, index) => (
                <SortableItem key={resource.id} resource={resource} index={index} />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <p className="text-sm text-gray-500">
            {items.length} resources
            {hasChanges && <span className="text-amber-600 ml-2">(unsaved changes)</span>}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              className="bg-[#dd1969] hover:bg-[#c01559]"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Order
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
