'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { Copy, ExternalLink, Trash2, Search, Clock, CheckCircle, XCircle, Send, Ban, Pencil, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface PendingCheckout {
  id: string
  user_email: string
  plan_id?: string
  plan_name: string | null
  plan_price: number | null
  billing_period: string | null
  checkout_url: string | null
  status: 'pending' | 'sent' | 'completed' | 'expired' | 'canceled'
  sent_method: 'email' | 'copied' | 'manual' | null
  expires_at: string | null
  created_at: string
  completed_at: string | null
  notes: string | null
  metadata?: {
    first_name?: string | null
    last_name?: string | null
    [key: string]: any
  } | null
}

interface SubscriptionPlan {
  id: string
  name: string
  plan_tier: string
  price: number
  billing_period: string
  is_active: boolean
}

interface PendingCheckoutsTableProps {
  checkouts: PendingCheckout[]
  plans?: SubscriptionPlan[]
}

export function PendingCheckoutsTable({ checkouts: initialCheckouts, plans = [] }: PendingCheckoutsTableProps) {
  const [checkouts, setCheckouts] = useState(initialCheckouts)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Edit modal state
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editingCheckout, setEditingCheckout] = useState<PendingCheckout | null>(null)
  const [editEmail, setEditEmail] = useState('')
  const [editPlanId, setEditPlanId] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Confirmation dialog state
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [checkoutToCancel, setCheckoutToCancel] = useState<string | null>(null)
  const [checkoutToDelete, setCheckoutToDelete] = useState<string | null>(null)

  const filteredCheckouts = checkouts.filter((checkout) => {
    const matchesSearch = checkout.user_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      checkout.plan_name?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesStatus = statusFilter === 'all' || checkout.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const handleCopyLink = async (checkout: PendingCheckout) => {
    if (!checkout.checkout_url) return

    try {
      await navigator.clipboard.writeText(checkout.checkout_url)
      setCopiedId(checkout.id)
      toast.success('Link copied to clipboard')
      setTimeout(() => setCopiedId(null), 2000)
    } catch (error) {
      toast.error('Failed to copy link')
    }
  }

  const handleCancelClick = (checkoutId: string) => {
    setCheckoutToCancel(checkoutId)
    setCancelDialogOpen(true)
  }

  const handleCancelConfirm = async () => {
    if (!checkoutToCancel) return

    try {
      const response = await fetch(`/api/admin/subscriptions/checkout/${checkoutToCancel}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'canceled' }),
      })

      if (!response.ok) throw new Error('Failed to cancel')

      setCheckouts(checkouts.map(c =>
        c.id === checkoutToCancel ? { ...c, status: 'canceled' as const } : c
      ))
      toast.success('Checkout link canceled')
    } catch (error) {
      toast.error('Failed to cancel checkout')
    } finally {
      setCancelDialogOpen(false)
      setCheckoutToCancel(null)
    }
  }

  const handleDeleteClick = (checkoutId: string) => {
    setCheckoutToDelete(checkoutId)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!checkoutToDelete) return

    try {
      const response = await fetch(`/api/admin/subscriptions/checkout/${checkoutToDelete}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Failed to delete')

      setCheckouts(checkouts.filter(c => c.id !== checkoutToDelete))
      toast.success('Checkout deleted')
    } catch (error) {
      toast.error('Failed to delete checkout')
    } finally {
      setDeleteDialogOpen(false)
      setCheckoutToDelete(null)
    }
  }

  const openEditModal = (checkout: PendingCheckout) => {
    setEditingCheckout(checkout)
    setEditEmail(checkout.user_email)
    setEditPlanId(checkout.plan_id || '')
    setEditNotes(checkout.notes || '')
    setEditFirstName(checkout.metadata?.first_name || '')
    setEditLastName(checkout.metadata?.last_name || '')
    setIsEditOpen(true)
  }

  const closeEditModal = () => {
    setIsEditOpen(false)
    setEditingCheckout(null)
    setEditEmail('')
    setEditPlanId('')
    setEditNotes('')
    setEditFirstName('')
    setEditLastName('')
  }

  const handleEditSubmit = async () => {
    if (!editingCheckout) return
    if (!editEmail.trim()) {
      toast.error('Email is required')
      return
    }

    setIsSubmitting(true)

    try {
      // First update the checkout record with new email/notes
      const updateResponse = await fetch(`/api/admin/subscriptions/checkout/${editingCheckout.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail: editEmail.trim(),
          planId: editPlanId || editingCheckout.plan_id,
          notes: editNotes.trim() || null,
          firstName: editFirstName.trim() || null,
          lastName: editLastName.trim() || null,
        }),
      })

      if (!updateResponse.ok) throw new Error('Failed to update checkout')

      // Then generate new checkout link
      const resendResponse = await fetch('/api/admin/subscriptions/checkout/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkoutId: editingCheckout.id,
          userEmail: editEmail.trim(),
          planId: editPlanId || editingCheckout.plan_id,
          firstName: editFirstName.trim() || null,
          lastName: editLastName.trim() || null,
        }),
      })

      if (!resendResponse.ok) throw new Error('Failed to generate new link')

      const data = await resendResponse.json()

      // Find the selected plan details
      const selectedPlan = plans.find(p => p.id === (editPlanId || editingCheckout.plan_id))

      // Update the checkout in state
      setCheckouts(checkouts.map(c =>
        c.id === editingCheckout.id ? {
          ...c,
          user_email: editEmail.trim(),
          plan_id: editPlanId || editingCheckout.plan_id,
          plan_name: selectedPlan?.name || c.plan_name,
          plan_price: selectedPlan?.price || c.plan_price,
          billing_period: selectedPlan?.billing_period || c.billing_period,
          notes: editNotes.trim() || null,
          checkout_url: data.checkoutUrl,
          expires_at: data.expiresAt,
          status: 'pending' as const
        } : c
      ))

      // Copy new link to clipboard
      await navigator.clipboard.writeText(data.checkoutUrl)
      toast.success('Checkout updated and new link copied to clipboard')
      closeEditModal()
    } catch (error) {
      toast.error('Failed to update checkout')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleQuickResend = async (checkout: PendingCheckout) => {
    // Quick resend without editing - just generates new link
    try {
      const response = await fetch('/api/admin/subscriptions/checkout/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutId: checkout.id }),
      })

      if (!response.ok) throw new Error('Failed to resend')

      const data = await response.json()

      // Update the checkout in state with new URL and reset status
      setCheckouts(checkouts.map(c =>
        c.id === checkout.id ? {
          ...c,
          checkout_url: data.checkoutUrl,
          expires_at: data.expiresAt,
          status: 'pending' as const
        } : c
      ))

      // Copy new link to clipboard
      await navigator.clipboard.writeText(data.checkoutUrl)
      toast.success('New checkout link created and copied to clipboard')
    } catch (error) {
      toast.error('Failed to create new checkout link')
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800 flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</span>
      case 'sent':
        return <span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800 flex items-center gap-1"><Send className="w-3 h-3" /> Sent</span>
      case 'completed':
        return <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-800 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Completed</span>
      case 'expired':
        return <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800 flex items-center gap-1"><XCircle className="w-3 h-3" /> Expired</span>
      case 'canceled':
        return <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-800 flex items-center gap-1"><XCircle className="w-3 h-3" /> Canceled</span>
      default:
        return <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800">{status}</span>
    }
  }

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false
    return new Date(expiresAt) < new Date()
  }

  // Summary counts
  const pendingCount = checkouts.filter(c => c.status === 'pending' || c.status === 'sent').length
  const completedCount = checkouts.filter(c => c.status === 'completed').length
  const expiredCount = checkouts.filter(c => c.status === 'expired' || isExpired(c.expires_at)).length

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Pending Checkouts</h2>
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <span>Pending: {pendingCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span>Completed: {completedCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gray-500"></div>
              <span>Expired: {expiredCount}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by email or plan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="canceled">Canceled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-3 px-2 font-semibold">Email</th>
              <th className="text-left py-3 px-2 font-semibold">Plan</th>
              <th className="text-left py-3 px-2 font-semibold">Status</th>
              <th className="text-left py-3 px-2 font-semibold">Created</th>
              <th className="text-left py-3 px-2 font-semibold">Expires</th>
              <th className="text-right py-3 px-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCheckouts.map((checkout) => (
              <tr key={checkout.id} className="border-b hover:bg-muted/50">
                <td className="py-3 px-2">
                  <div>
                    <span className="font-medium">{checkout.user_email}</span>
                    {checkout.notes && (
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">{checkout.notes}</p>
                    )}
                  </div>
                </td>
                <td className="py-3 px-2">
                  <div>
                    <span>{checkout.plan_name || '-'}</span>
                    {checkout.plan_price && (
                      <p className="text-xs text-muted-foreground">
                        ${checkout.plan_price}/{checkout.billing_period}
                      </p>
                    )}
                  </div>
                </td>
                <td className="py-3 px-2">
                  {getStatusBadge(isExpired(checkout.expires_at) && checkout.status !== 'completed' && checkout.status !== 'canceled' ? 'expired' : checkout.status)}
                </td>
                <td className="py-3 px-2 text-muted-foreground">
                  {new Date(checkout.created_at).toLocaleDateString()}
                </td>
                <td className="py-3 px-2 text-muted-foreground">
                  {checkout.expires_at ? (
                    <span className={isExpired(checkout.expires_at) ? 'text-red-600' : ''}>
                      {new Date(checkout.expires_at).toLocaleDateString()}
                    </span>
                  ) : '-'}
                </td>
                <td className="py-3 px-2">
                  <div className="flex items-center justify-end gap-1">
                    {/* Copy & Open - only for active links */}
                    {checkout.checkout_url && checkout.status !== 'completed' && checkout.status !== 'canceled' && !isExpired(checkout.expires_at) && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyLink(checkout)}
                          title="Copy link"
                        >
                          {copiedId === checkout.id ? (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(checkout.checkout_url!, '_blank')}
                          title="Open link"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    {/* Edit & Resend - for non-completed checkouts */}
                    {checkout.status !== 'completed' && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(checkout)}
                          title="Edit and generate new link"
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleQuickResend(checkout)}
                          title="Quick resend (same details)"
                          className="text-green-600 hover:text-green-700"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    {/* Cancel - only for active links */}
                    {checkout.status !== 'completed' && checkout.status !== 'canceled' && !isExpired(checkout.expires_at) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelClick(checkout.id)}
                        title="Cancel link"
                        className="text-orange-600 hover:text-orange-700"
                      >
                        <Ban className="w-4 h-4" />
                      </Button>
                    )}
                    {/* Delete - available for all checkouts */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteClick(checkout.id)}
                      title="Delete permanently"
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredCheckouts.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  No pending checkouts found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Checkout Modal */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Checkout</DialogTitle>
            <DialogDescription>
              Update the checkout details and generate a new link.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="customer@example.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-first-name">First Name</Label>
                <Input
                  id="edit-first-name"
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  placeholder="John"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-last-name">Last Name</Label>
                <Input
                  id="edit-last-name"
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                  placeholder="Doe"
                />
              </div>
            </div>
            {plans.length > 0 && (
              <div className="grid gap-2">
                <Label htmlFor="edit-plan">Plan</Label>
                <Select value={editPlanId} onValueChange={setEditPlanId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name} - ${plan.price}/{plan.billing_period}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="edit-notes">Notes (optional)</Label>
              <Textarea
                id="edit-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Internal notes about this checkout..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEditModal} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleEditSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                'Update & Generate Link'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Checkout Confirmation */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Checkout Link?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this checkout link? The link will no longer work and the customer won't be able to complete their purchase.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Link</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelConfirm}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Cancel Link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Checkout Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Checkout Record?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete this checkout record? This action cannot be undone.
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
    </Card>
  )
}
