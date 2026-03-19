'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Profile, PlanTier, SubscriptionPlan } from '@/types/database.types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { Search, Plus, Edit, XCircle, PauseCircle, PlayCircle, ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react'
import { EditUserModal } from './EditUserModal'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { CheckoutDialog } from './CheckoutDialog'
import { Label } from '@/components/ui/label'

// Format subscription status to Start Case (e.g., "past_due" → "Past Due")
const formatStatus = (status?: string): string => {
  if (!status) return 'None'
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

interface SubscriptionsTableProps {
  initialSubscriptions: Profile[]
  plans: SubscriptionPlan[]
  isSuperAdmin?: boolean
}

export function SubscriptionsTable({
  initialSubscriptions,
  plans,
  isSuperAdmin = false,
}: SubscriptionsTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [subscriptions, setSubscriptions] = useState(initialSubscriptions)
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isCheckoutDialogOpen, setIsCheckoutDialogOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)
  const [isPauseDialogOpen, setIsPauseDialogOpen] = useState(false)
  const [pauseMode, setPauseMode] = useState<'indefinite' | 'until_date'>('indefinite')
  const [pauseUntilDate, setPauseUntilDate] = useState('')
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(false)
  const [isSyncingAll, setIsSyncingAll] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20

  // Sync local state when server data changes (e.g., after router.refresh())
  useEffect(() => {
    setSubscriptions(initialSubscriptions)
    // Also update selectedUser if it exists (to get fresh data after edit)
    if (selectedUser) {
      const updatedUser = initialSubscriptions.find(sub => sub.id === selectedUser.id)
      if (updatedUser) {
        setSelectedUser(updatedUser)
      }
    }
  }, [initialSubscriptions])

  // Auto-open modal if user query param is present (from All Users redirect)
  useEffect(() => {
    const userId = searchParams.get('user')
    if (userId) {
      const user = initialSubscriptions.find(sub => sub.id === userId)
      if (user) {
        setSelectedUser(user)
        setIsEditModalOpen(true)
        // Clear the query param
        router.replace('/admin/subscriptions', { scroll: false })
      }
    }
  }, [searchParams, initialSubscriptions, router])

  // Filter subscriptions
  const filteredSubscriptions = subscriptions.filter((sub) => {
    // Exclude users without a valid membership tier
    const planTierStr = sub.plan_tier as string | undefined
    const hasValidTier = planTierStr &&
      planTierStr !== 'Pending Checkout' &&
      planTierStr.trim() !== ''

    if (!hasValidTier) return false

    const matchesSearch =
      sub.email?.toLowerCase().includes(search.toLowerCase()) ||
      sub.full_name?.toLowerCase().includes(search.toLowerCase())

    const matchesPlan = planFilter === 'all' || sub.plan_tier === planFilter
    const matchesStatus =
      statusFilter === 'all' || sub.subscription_status === statusFilter

    return matchesSearch && matchesPlan && matchesStatus
  })

  // Pagination
  const totalPages = Math.ceil(filteredSubscriptions.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedSubscriptions = filteredSubscriptions.slice(startIndex, endIndex)

  // Reset to page 1 when filters change
  const handleSearchChange = (value: string) => {
    setSearch(value)
    setCurrentPage(1)
  }

  const handlePlanFilterChange = (value: string) => {
    setPlanFilter(value)
    setCurrentPage(1)
  }

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value)
    setCurrentPage(1)
  }

  const getStatusBadgeVariant = (status?: string) => {
    switch (status) {
      case 'active':
        return 'default'
      case 'trialing':
        return 'secondary'
      case 'past_due':
        return 'destructive'
      case 'canceled':
        return 'outline'
      case 'paused':
        return 'secondary'
      default:
        return 'outline'
    }
  }

  const handlePauseResume = async (action: 'pause' | 'resume', user?: Profile, resumeDate?: string) => {
    const targetUser = user || selectedUser
    if (!targetUser) return

    setLoading(true)
    try {
      const body: any = { action }
      if (action === 'pause' && resumeDate) {
        body.resumeDate = resumeDate
      }

      const response = await fetch(`/api/admin/subscriptions/${targetUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || `Failed to ${action} subscription`)
      }

      const successMessage = action === 'pause'
        ? resumeDate
          ? `Subscription paused until ${new Date(resumeDate).toLocaleDateString()}`
          : 'Subscription paused indefinitely'
        : 'Subscription resumed successfully'

      toast.success(successMessage)
      setIsPauseDialogOpen(false)
      setPauseMode('indefinite')
      setPauseUntilDate('')
      setSelectedUser(null)
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || `Failed to ${action} subscription`)
    } finally {
      setLoading(false)
    }
  }

  const handleCancelSubscription = async (immediate: boolean) => {
    if (!selectedUser) return

    setLoading(true)
    try {
      const response = await fetch(
        `/api/admin/subscriptions/${selectedUser.id}?immediate=${immediate}`,
        { method: 'DELETE' }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to cancel subscription')
      }

      toast.success(
        immediate
          ? 'Subscription canceled immediately'
          : 'Subscription will be canceled at period end'
      )
      setIsCancelDialogOpen(false)
      setSelectedUser(null)
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Failed to cancel subscription')
    } finally {
      setLoading(false)
    }
  }

  const handleSyncAll = async () => {
    setIsSyncingAll(true)
    try {
      const response = await fetch('/api/admin/subscriptions/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to sync subscriptions')
      }

      const { summary } = data
      if (summary.synced > 0 || summary.failed > 0) {
        toast.success(
          `Sync complete: ${summary.synced} updated, ${summary.skipped} already in sync, ${summary.failed} failed`
        )
      } else {
        toast.success('All subscriptions are already in sync')
      }

      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Failed to sync subscriptions')
    } finally {
      setIsSyncingAll(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search by email or name..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={planFilter} onValueChange={handlePlanFilterChange}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Plans</SelectItem>
            <SelectItem value="None">None</SelectItem>
            <SelectItem value="Premium">Premium</SelectItem>
            <SelectItem value="Elite">Elite</SelectItem>
            <SelectItem value="VIP">VIP</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="trialing">Trialing</SelectItem>
            <SelectItem value="past_due">Past Due</SelectItem>
            <SelectItem value="canceled">Canceled</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={handleSyncAll}
          disabled={isSyncingAll}
        >
          {isSyncingAll ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Sync All
        </Button>
        <Button onClick={() => setIsCheckoutDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Subscription
        </Button>
      </div>

      {/* Count display */}
      <div className="text-sm text-muted-foreground">
        Showing <span className="font-semibold">{filteredSubscriptions.length > 0 ? startIndex + 1 : 0}-{Math.min(endIndex, filteredSubscriptions.length)}</span> of{' '}
        <span className="font-semibold">{filteredSubscriptions.length}</span> subscriptions
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Plan End</TableHead>
              <TableHead>Trial End</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSubscriptions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  No subscriptions found
                </TableCell>
              </TableRow>
            ) : (
              paginatedSubscriptions.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell className="font-medium">
                    {sub.full_name || 'No name'}
                  </TableCell>
                  <TableCell>{sub.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{sub.plan_tier}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(sub.subscription_status)}>
                      {sub.subscription_status || 'none'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {sub.pending_plan_effective_date
                      ? format(new Date(sub.pending_plan_effective_date), 'MMM d, yyyy')
                      : '-'}
                  </TableCell>
                  <TableCell>
                    {sub.trial_end_date
                      ? format(new Date(sub.trial_end_date), 'MMM d, yyyy')
                      : '-'}
                  </TableCell>
                  <TableCell>
                    {format(new Date(sub.created_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedUser(sub)
                          setIsEditModalOpen(true)
                        }}
                        title="Edit user profile, subscription, and escalations"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      {sub.subscription_status === 'paused' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handlePauseResume('resume', sub)}
                          disabled={!sub.stripe_subscription_id || loading}
                          title="Resume subscription - Restart billing and payment collection"
                        >
                          <PlayCircle className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(sub)
                            setPauseMode('indefinite')
                            setPauseUntilDate('')
                            setIsPauseDialogOpen(true)
                          }}
                          disabled={!sub.stripe_subscription_id || loading}
                          title="Pause subscription - Stop billing while keeping membership active"
                        >
                          <PauseCircle className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedUser(sub)
                          setIsCancelDialogOpen(true)
                        }}
                        disabled={!sub.stripe_subscription_id}
                        title="Cancel subscription - End membership immediately or at period end"
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <div className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
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
                        <span className="text-muted-foreground px-2">...</span>
                      )}
                      <Button
                        variant={currentPage === page ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCurrentPage(page)}
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
      )}

      {/* Checkout Dialog */}
      <CheckoutDialog
        open={isCheckoutDialogOpen}
        onOpenChange={setIsCheckoutDialogOpen}
        plans={plans}
        onCheckoutCreated={() => router.refresh()}
      />

      {/* Edit User Modal - opens to Subscription tab */}
      <EditUserModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setSelectedUser(null)
        }}
        user={selectedUser}
        defaultTab="subscription"
        plans={plans}
        isSuperAdmin={isSuperAdmin}
      />

      {/* Cancel Subscription Dialog */}
      <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Subscription</AlertDialogTitle>
            <AlertDialogDescription>
              Do you want to cancel the subscription for {selectedUser?.email}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => handleCancelSubscription(false)}
              disabled={loading}
            >
              Cancel at Period End
            </Button>
            <AlertDialogAction
              onClick={() => handleCancelSubscription(true)}
              disabled={loading}
              className="bg-red-600 hover:bg-red-700"
            >
              Cancel Immediately
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pause Subscription Dialog */}
      <AlertDialog open={isPauseDialogOpen} onOpenChange={setIsPauseDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pause Subscription</AlertDialogTitle>
            <AlertDialogDescription>
              Pause billing for {selectedUser?.email}. The member will retain access but won't be charged.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setPauseMode('indefinite')}
                className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                  pauseMode === 'indefinite'
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-medium">Pause indefinitely</div>
                <div className="text-sm text-gray-500">Subscription stays paused until manually resumed</div>
              </button>
              <button
                type="button"
                onClick={() => setPauseMode('until_date')}
                className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                  pauseMode === 'until_date'
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-medium">Pause until specific date</div>
                <div className="text-sm text-gray-500">Subscription automatically resumes on the selected date</div>
              </button>
            </div>

            {pauseMode === 'until_date' && (
              <div className="pt-2">
                <Label htmlFor="pause-date" className="text-sm font-medium">Resume Date</Label>
                <Input
                  id="pause-date"
                  type="date"
                  value={pauseUntilDate}
                  onChange={(e) => setPauseUntilDate(e.target.value)}
                  min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                  className="mt-1"
                />
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setIsPauseDialogOpen(false)
              setSelectedUser(null)
              setPauseMode('indefinite')
              setPauseUntilDate('')
            }}>
              Cancel
            </AlertDialogCancel>
            <Button
              onClick={() => {
                const resumeDate = pauseMode === 'until_date' && pauseUntilDate ? pauseUntilDate : undefined
                handlePauseResume('pause', selectedUser || undefined, resumeDate)
              }}
              disabled={loading || (pauseMode === 'until_date' && !pauseUntilDate)}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Pausing...
                </>
              ) : (
                'Pause Subscription'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
