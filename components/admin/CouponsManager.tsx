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
import { Plus, Edit, Trash2, Copy, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
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

interface Coupon {
  id: string
  code: string
  description?: string
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  max_uses?: number
  current_uses: number
  valid_from?: string
  valid_until?: string
  is_active: boolean
  created_at: string
}

interface CouponsManagerProps {
  coupons: Coupon[]
}

export function CouponsManager({ coupons: initialCoupons }: CouponsManagerProps) {
  const router = useRouter()
  const [coupons, setCoupons] = useState(initialCoupons)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [couponToDelete, setCouponToDelete] = useState<Coupon | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  // Pagination calculations
  const totalItems = coupons.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedCoupons = coupons.slice(startIndex, endIndex)

  const [formData, setFormData] = useState({
    code: '',
    description: '',
    discount_type: 'percentage' as 'percentage' | 'fixed',
    discount_value: 0,
    duration: 'once' as 'once' | 'forever' | 'repeating',
    duration_in_months: 3 as number,
    max_uses: undefined as number | undefined,
    valid_from: '',
    valid_until: '',
    is_active: true,
  })

  const handleOpenDialog = (coupon?: Coupon) => {
    if (coupon) {
      setEditingCoupon(coupon)
      setFormData({
        code: coupon.code,
        description: coupon.description || '',
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        duration: 'once',
        duration_in_months: 3,
        max_uses: coupon.max_uses,
        valid_from: coupon.valid_from ? format(new Date(coupon.valid_from), 'yyyy-MM-dd') : '',
        valid_until: coupon.valid_until ? format(new Date(coupon.valid_until), 'yyyy-MM-dd') : '',
        is_active: coupon.is_active,
      })
    } else {
      setEditingCoupon(null)
      setFormData({
        code: '',
        description: '',
        discount_type: 'percentage',
        discount_value: 0,
        duration: 'once',
        duration_in_months: 3,
        max_uses: undefined,
        valid_from: '',
        valid_until: '',
        is_active: true,
      })
    }
    setIsDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const dataToSave = {
        code: formData.code.toUpperCase(),
        description: formData.description || null,
        discount_type: formData.discount_type,
        discount_value: formData.discount_value,
        duration: formData.duration,
        duration_in_months: formData.duration === 'repeating' ? formData.duration_in_months : null,
        max_uses: formData.max_uses || null,
        valid_from: formData.valid_from || null,
        valid_until: formData.valid_until || null,
        is_active: formData.is_active,
      }

      if (editingCoupon) {
        // Update existing coupon via API
        const response = await fetch(`/api/admin/coupons/${editingCoupon.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToSave),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to update coupon')
        }

        toast.success('Coupon updated successfully')
      } else {
        // Create new coupon via API (this creates in Stripe first)
        const response = await fetch('/api/admin/coupons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToSave),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to create coupon')
        }

        const result = await response.json()
        toast.success(`Coupon created successfully! Stripe Coupon ID: ${result.stripe?.coupon_id}`)
      }

      setIsDialogOpen(false)
      router.refresh()
      window.location.reload()
    } catch (error: any) {
      console.error('Error saving coupon:', error)
      toast.error(error.message || 'Failed to save coupon. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (coupon: Coupon) => {
    setCouponToDelete(coupon)
  }

  const confirmDelete = async () => {
    if (!couponToDelete) return

    try {
      const response = await fetch(`/api/admin/coupons/${couponToDelete.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete coupon')
      }

      toast.success('Coupon deleted from database and Stripe')
      router.refresh()
      window.location.reload()
    } catch (error: any) {
      console.error('Error deleting coupon:', error)
      toast.error(error.message || 'Failed to delete coupon. Please try again.')
    } finally {
      setCouponToDelete(null)
    }
  }

  const toggleActive = async (coupon: Coupon) => {
    try {
      const response = await fetch(`/api/admin/coupons/${coupon.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !coupon.is_active }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update coupon')
      }

      toast.success(`Coupon ${!coupon.is_active ? 'activated' : 'deactivated'} in Stripe`)
      router.refresh()
      window.location.reload()
    } catch (error: any) {
      console.error('Error updating coupon:', error)
      toast.error(error.message || 'Failed to update coupon. Please try again.')
    }
  }

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  const formatDiscount = (coupon: Coupon) => {
    if (coupon.discount_type === 'percentage') {
      return `${coupon.discount_value}%`
    }
    return `$${coupon.discount_value.toFixed(2)}`
  }

  const isExpired = (coupon: Coupon) => {
    if (!coupon.valid_until) return false
    return new Date(coupon.valid_until) < new Date()
  }

  const isMaxedOut = (coupon: Coupon) => {
    if (!coupon.max_uses) return false
    return coupon.current_uses >= coupon.max_uses
  }

  const handleSyncFromStripe = async () => {
    setIsSyncing(true)
    try {
      const response = await fetch('/api/admin/coupons', {
        method: 'PATCH',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to sync coupons')
      }

      const result = await response.json()
      if (result.stripe_coupons_found === 0) {
        toast.info('No coupons found in Stripe.')
      } else {
        toast.success(`Found ${result.stripe_coupons_found} in Stripe. Synced ${result.synced} coupons (${result.created} created, ${result.updated} updated)`)
      }
      router.refresh()
      window.location.reload()
    } catch (error: any) {
      console.error('Error syncing coupons:', error)
      toast.error(error.message || 'Failed to sync coupons from Stripe')
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Action Buttons */}
      <div className="flex justify-end gap-2">
        <Button
          onClick={handleSyncFromStripe}
          variant="outline"
          disabled={isSyncing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing...' : 'Sync from Stripe'}
        </Button>
        <Button
          onClick={() => handleOpenDialog()}
          className="bg-[#dd1969] hover:bg-[#c01559]"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Coupon
        </Button>
      </div>

      {/* Coupons Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Valid Period</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedCoupons.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                  No coupons found. Create your first coupon!
                </TableCell>
              </TableRow>
            ) : (
              paginatedCoupons.map((coupon) => (
                <TableRow key={coupon.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-bold bg-gray-100 px-3 py-1 rounded">
                        {coupon.code}
                      </code>
                      <button
                        onClick={() => copyCode(coupon.code)}
                        className="p-1 hover:bg-gray-100 rounded"
                        title="Copy code"
                      >
                        {copiedCode === coupon.code ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </div>
                    {coupon.description && (
                      <p className="text-xs text-gray-500 mt-1">{coupon.description}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold text-[#8b1554]">
                      {formatDiscount(coupon)}
                    </span>
                    <span className="text-xs text-gray-500 ml-1">off</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {coupon.current_uses}
                      {coupon.max_uses && ` / ${coupon.max_uses}`}
                    </span>
                    {isMaxedOut(coupon) && (
                      <Badge className="ml-2 bg-orange-100 text-orange-800">Maxed</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm space-y-1">
                      {coupon.valid_from && (
                        <div>
                          <span className="text-gray-500">From:</span>{' '}
                          {format(new Date(coupon.valid_from), 'MMM dd, yyyy')}
                        </div>
                      )}
                      {coupon.valid_until && (
                        <div>
                          <span className="text-gray-500">Until:</span>{' '}
                          {format(new Date(coupon.valid_until), 'MMM dd, yyyy')}
                        </div>
                      )}
                      {!coupon.valid_from && !coupon.valid_until && (
                        <span className="text-gray-400">No limit</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <button onClick={() => toggleActive(coupon)}>
                      <Badge
                        className={
                          isExpired(coupon) || isMaxedOut(coupon)
                            ? 'bg-red-100 text-red-800 hover:bg-red-200'
                            : coupon.is_active
                            ? 'bg-green-100 text-green-800 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                        }
                      >
                        {isExpired(coupon)
                          ? 'Expired'
                          : isMaxedOut(coupon)
                          ? 'Maxed Out'
                          : coupon.is_active
                          ? 'Active'
                          : 'Inactive'}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(coupon)}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(coupon)}
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
        <DialogContent className="sm:max-w-[550px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingCoupon ? 'Edit Coupon' : 'Add New Coupon'}
              </DialogTitle>
              <DialogDescription>
                {editingCoupon
                  ? 'Update the coupon information below.'
                  : 'Create a new discount coupon.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-2">
                <Label htmlFor="code">Coupon Code *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value.toUpperCase() })
                  }
                  placeholder="e.g., SAVE20, WELCOME"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of this coupon"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="discount_type">Discount Type *</Label>
                  <select
                    id="discount_type"
                    value={formData.discount_type}
                    onChange={(e) => {
                      const newType = e.target.value as 'percentage' | 'fixed'
                      setFormData({
                        ...formData,
                        discount_type: newType,
                        // Reset to 'once' if switching to fixed and was 'forever'
                        duration: newType === 'fixed' && formData.duration === 'forever' ? 'once' : formData.duration,
                      })
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b1554]"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount ($)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="discount_value">Discount Value *</Label>
                  <Input
                    id="discount_value"
                    type="number"
                    value={formData.discount_value}
                    onChange={(e) =>
                      setFormData({ ...formData, discount_value: parseFloat(e.target.value) })
                    }
                    min="0"
                    step={formData.discount_type === 'percentage' ? '1' : '0.01'}
                    max={formData.discount_type === 'percentage' ? '100' : undefined}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="duration">Duration *</Label>
                  <select
                    id="duration"
                    value={formData.duration}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        duration: e.target.value as 'once' | 'forever' | 'repeating',
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b1554]"
                  >
                    <option value="once">Once (first payment only)</option>
                    {formData.discount_type === 'percentage' && (
                      <option value="forever">Forever (all payments)</option>
                    )}
                    <option value="repeating">Multiple months</option>
                  </select>
                  {formData.discount_type === 'fixed' && (
                    <p className="text-xs text-gray-500">Note: Fixed amount coupons cannot use &quot;Forever&quot; duration</p>
                  )}
                </div>

                {formData.duration === 'repeating' && (
                  <div className="space-y-2">
                    <Label htmlFor="duration_in_months">Number of Months *</Label>
                    <Input
                      id="duration_in_months"
                      type="number"
                      value={formData.duration_in_months}
                      onChange={(e) =>
                        setFormData({ ...formData, duration_in_months: parseInt(e.target.value) || 1 })
                      }
                      min="1"
                      max="36"
                      required
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_uses">Maximum Uses (optional)</Label>
                <Input
                  id="max_uses"
                  type="number"
                  value={formData.max_uses || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      max_uses: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                  placeholder="Unlimited"
                  min="1"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="valid_from">Valid From (optional)</Label>
                  <Input
                    id="valid_from"
                    type="date"
                    value={formData.valid_from}
                    onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="valid_until">Valid Until (optional)</Label>
                  <Input
                    id="valid_until"
                    type="date"
                    value={formData.valid_until}
                    onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="is_active">
                  Active (users can use this coupon)
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
                {isSubmitting ? 'Saving...' : editingCoupon ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!couponToDelete} onOpenChange={(open) => !open && setCouponToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Coupon?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the coupon code &quot;{couponToDelete?.code}&quot;?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Coupon
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
