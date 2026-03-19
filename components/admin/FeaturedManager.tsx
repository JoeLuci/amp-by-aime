'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Star, X, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
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

interface FeaturedManagerProps {
  featuredResources: any[]
  featuredEvents: any[]
  featuredLenders: any[]
  featuredVendors: any[]
  allResources: any[]
  allEvents: any[]
  allLenders: any[]
  allVendors: any[]
}

export function FeaturedManager({
  featuredResources,
  featuredEvents,
  featuredLenders,
  featuredVendors,
  allResources,
  allEvents,
  allLenders,
  allVendors,
}: FeaturedManagerProps) {
  const router = useRouter()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [dialogType, setDialogType] = useState<'resource' | 'event' | 'lender' | 'vendor'>('resource')
  const [selectedItem, setSelectedItem] = useState('')
  const [itemToRemove, setItemToRemove] = useState<{ id: string; type: 'resource' | 'event' | 'lender' | 'vendor'; name: string } | null>(null)

  const handleOpenDialog = (type: 'resource' | 'event' | 'lender' | 'vendor') => {
    setDialogType(type)
    setSelectedItem('')
    setIsDialogOpen(true)
  }

  const handleAddFeatured = async () => {
    if (!selectedItem) {
      toast.error('Please select an item')
      return
    }

    try {
      const supabase = createClient()
      let tableName = ''
      let updateData: any = {}

      switch (dialogType) {
        case 'resource':
          tableName = 'resources'
          updateData = { is_featured: true }
          break
        case 'event':
          tableName = 'events'
          updateData = { is_featured: true }
          break
        case 'lender':
          tableName = 'lenders'
          updateData = { is_featured: true }
          break
        case 'vendor':
          tableName = 'vendors'
          updateData = { is_core_partner: true }
          break
      }

      const { error } = await supabase
        .from(tableName)
        .update(updateData)
        .eq('id', selectedItem)

      if (error) throw error

      toast.success('Item added to featured successfully!')
      router.refresh()
      setIsDialogOpen(false)
    } catch (error) {
      console.error('Error adding featured item:', error)
      toast.error('Failed to add featured item. Please try again.')
    }
  }

  const handleRemoveFeatured = async (
    id: string,
    type: 'resource' | 'event' | 'lender' | 'vendor',
    name: string
  ) => {
    setItemToRemove({ id, type, name })
  }

  const confirmRemoveFeatured = async () => {
    if (!itemToRemove) return

    try {
      const supabase = createClient()
      let tableName = ''
      let updateData: any = {}

      switch (itemToRemove.type) {
        case 'resource':
          tableName = 'resources'
          updateData = { is_featured: false }
          break
        case 'event':
          tableName = 'events'
          updateData = { is_featured: false }
          break
        case 'lender':
          tableName = 'lenders'
          updateData = { is_featured: false }
          break
        case 'vendor':
          tableName = 'vendors'
          updateData = { is_core_partner: false }
          break
      }

      const { error } = await supabase.from(tableName).update(updateData).eq('id', itemToRemove.id)

      if (error) throw error

      toast.success('Item removed from featured successfully')
      router.refresh()
    } catch (error) {
      console.error('Error removing featured item:', error)
      toast.error('Failed to remove featured item. Please try again.')
    } finally {
      setItemToRemove(null)
    }
  }

  return (
    <div className="space-y-8">
      {/* Featured Resources */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            <h2 className="text-xl font-bold text-gray-900">Featured Resources</h2>
            <Badge>{featuredResources.length}</Badge>
          </div>
          <Button
            onClick={() => handleOpenDialog('resource')}
            className="bg-[#dd1969] hover:bg-[#c01559]"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Resource
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {featuredResources.length === 0 ? (
            <p className="text-gray-500 col-span-full text-center py-8">No featured resources</p>
          ) : (
            featuredResources.map((resource) => (
              <div key={resource.id} className="border rounded-lg p-4 relative group">
                <button
                  onClick={() => handleRemoveFeatured(resource.id, 'resource', resource.title)}
                  className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
                <Badge className="mb-2">{resource.resource_type}</Badge>
                <h3 className="font-semibold text-gray-900">{resource.title}</h3>
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{resource.description}</p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Featured Lenders */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            <h2 className="text-xl font-bold text-gray-900">Featured Lenders</h2>
            <Badge>{featuredLenders.length}</Badge>
          </div>
          <Button
            onClick={() => handleOpenDialog('lender')}
            className="bg-[#dd1969] hover:bg-[#c01559]"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Lender
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {featuredLenders.length === 0 ? (
            <p className="text-gray-500 col-span-full text-center py-8">No featured lenders</p>
          ) : (
            featuredLenders.map((lender) => (
              <div key={lender.id} className="border rounded-lg p-4 relative group">
                <button
                  onClick={() => handleRemoveFeatured(lender.id, 'lender', lender.name)}
                  className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
                {lender.lender_type && <Badge className="mb-2">{lender.lender_type}</Badge>}
                <h3 className="font-semibold text-gray-900">{lender.name}</h3>
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{lender.description}</p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Featured Vendors */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            <h2 className="text-xl font-bold text-gray-900">Featured Vendors</h2>
            <Badge>{featuredVendors.length}</Badge>
          </div>
          <Button
            onClick={() => handleOpenDialog('vendor')}
            className="bg-[#dd1969] hover:bg-[#c01559]"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Vendor
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {featuredVendors.length === 0 ? (
            <p className="text-gray-500 col-span-full text-center py-8">No core/affiliate vendors</p>
          ) : (
            featuredVendors.map((vendor) => (
              <div key={vendor.id} className="border rounded-lg p-4 relative group">
                <button
                  onClick={() => handleRemoveFeatured(vendor.id, 'vendor', vendor.name)}
                  className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
                <div className="flex gap-2 mb-2">
                  {vendor.is_core_partner && <Badge className="bg-purple-100 text-purple-800">Core</Badge>}
                  {vendor.is_affiliate && <Badge className="bg-blue-100 text-blue-800">Affiliate</Badge>}
                </div>
                <h3 className="font-semibold text-gray-900">{vendor.name}</h3>
                <p className="text-sm text-gray-500 mt-1">{vendor.vendor_category}</p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Featured Events */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            <h2 className="text-xl font-bold text-gray-900">Featured Events</h2>
            <Badge>{featuredEvents.length}</Badge>
          </div>
          <Button
            onClick={() => handleOpenDialog('event')}
            className="bg-[#dd1969] hover:bg-[#c01559]"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Event
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {featuredEvents.length === 0 ? (
            <p className="text-gray-500 col-span-full text-center py-8">No featured events</p>
          ) : (
            featuredEvents.map((event) => (
              <div key={event.id} className="border rounded-lg p-4 relative group">
                <button
                  onClick={() => handleRemoveFeatured(event.id, 'event', event.title)}
                  className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
                <Badge className="mb-2">{event.event_type}</Badge>
                <h3 className="font-semibold text-gray-900">{event.title}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {new Date(event.start_date).toLocaleDateString()}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Featured Item Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Featured {dialogType}</DialogTitle>
            <DialogDescription>
              Select a {dialogType} to feature on the platform
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="item">
                Select {dialogType.charAt(0).toUpperCase() + dialogType.slice(1)}
              </Label>
              <select
                id="item"
                value={selectedItem}
                onChange={(e) => setSelectedItem(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b1554]"
              >
                <option value="">Choose an option</option>
                {dialogType === 'resource' &&
                  allResources
                    .filter((r) => !r.is_featured)
                    .map((resource) => (
                      <option key={resource.id} value={resource.id}>
                        {resource.title} ({resource.resource_type})
                      </option>
                    ))}
                {dialogType === 'event' &&
                  allEvents
                    .filter((e) => !e.is_featured)
                    .map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.title} ({event.event_type})
                      </option>
                    ))}
                {dialogType === 'lender' &&
                  allLenders
                    .filter((l) => !l.is_featured)
                    .map((lender) => (
                      <option key={lender.id} value={lender.id}>
                        {lender.name}
                      </option>
                    ))}
                {dialogType === 'vendor' &&
                  allVendors
                    .filter((v) => !v.is_core_partner && !v.is_affiliate)
                    .map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </option>
                    ))}
              </select>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddFeatured}
                className="flex-1 bg-[#dd1969] hover:bg-[#c01559]"
              >
                Add Featured
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <AlertDialog open={!!itemToRemove} onOpenChange={(open) => !open && setItemToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from Featured?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove &quot;{itemToRemove?.name}&quot; from featured {itemToRemove?.type}s?
              This will not delete the item, just remove it from the featured list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemoveFeatured}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove from Featured
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
