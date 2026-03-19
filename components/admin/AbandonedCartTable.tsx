'use client'

import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useSortableData } from '@/hooks/useSortableData'
import { SortableTableHeader } from '@/components/ui/sortable-table-header'
import { Search, Trash2, ShoppingCart, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getRoleDisplayName } from '@/lib/constants/roles'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface User {
  id: string
  email?: string
  full_name?: string
  first_name?: string
  last_name?: string
  role?: string
  company_name?: string
  phone?: string
  plan_tier?: string
  subscription_status?: string
  created_at: string
  onboarding_step?: string
}

interface SubscriptionPlan {
  id: string
  name: string
  plan_tier: string
  price: number
  billing_period: string
  is_active: boolean
}

interface AbandonedCartTableProps {
  users: User[]
  plans: SubscriptionPlan[]
}

export function AbandonedCartTable({ users, plans }: AbandonedCartTableProps) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20
  const [userToDelete, setUserToDelete] = useState<User | null>(null)
  const [sendingCheckoutLink, setSendingCheckoutLink] = useState<string | null>(null)
  const [checkoutDialogUser, setCheckoutDialogUser] = useState<User | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<string>(plans[0]?.id || '')
  const [checkoutFirstName, setCheckoutFirstName] = useState('')
  const [checkoutLastName, setCheckoutLastName] = useState('')

  // Filter users based on search
  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      searchTerm === '' ||
      user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.company_name?.toLowerCase().includes(searchTerm.toLowerCase())

    return matchesSearch
  })

  // Apply sorting to filtered data
  const { items: sortedUsers, requestSort, sortConfig } = useSortableData(filteredUsers)

  // Pagination
  const totalPages = Math.ceil(sortedUsers.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedUsers = sortedUsers.slice(startIndex, endIndex)

  // Reset to page 1 when filters change
  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case 'broker_owner':
        return 'bg-orange-100 text-orange-800'
      case 'loan_officer':
        return 'bg-blue-100 text-blue-800'
      case 'loan_officer_assistant':
        return 'bg-purple-100 text-purple-800'
      case 'processor':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getOnboardingStepLabel = (step?: string) => {
    switch (step) {
      case 'select_plan':
        return 'Plan Selection'
      case 'complete_profile':
        return 'Profile Completion'
      case 'completed':
        return 'Completed'
      default:
        return step || 'Not Started'
    }
  }

  const handleSendCheckoutLink = async () => {
    if (!checkoutDialogUser?.email) return

    setSendingCheckoutLink(checkoutDialogUser.id)

    try {
      // Use existing admin checkout endpoint
      const response = await fetch('/api/admin/subscriptions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail: checkoutDialogUser.email,
          planId: selectedPlan,
          firstName: checkoutFirstName.trim() || undefined,
          lastName: checkoutLastName.trim() || undefined,
          notes: 'Sent from Abandoned Cart section'
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create checkout link')
      }

      const data = await response.json()

      // Copy link to clipboard for easy sharing
      if (data.checkoutUrl) {
        await navigator.clipboard.writeText(data.checkoutUrl)
        toast.success(`Checkout link created and copied to clipboard! Link sent to ${checkoutDialogUser.email}`)
      } else {
        toast.success(`Checkout link created for ${checkoutDialogUser.email}`)
      }

      setCheckoutDialogUser(null)
      router.refresh()
    } catch (error: any) {
      console.error('Error sending checkout link:', error)
      toast.error(error.message || 'Failed to send checkout link')
    } finally {
      setSendingCheckoutLink(null)
    }
  }

  const handleDeleteUser = async (user: User) => {
    setUserToDelete(user)
  }

  const confirmDeleteUser = async () => {
    if (!userToDelete) return

    const supabase = createClient()

    try {
      const { error } = await supabase.from('profiles').delete().eq('id', userToDelete.id)

      if (error) throw error

      toast.success('User deleted successfully')
      router.refresh()
    } catch (error) {
      console.error('Error deleting user:', error)
      toast.error('Failed to delete user. Please try again.')
    } finally {
      setUserToDelete(null)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Stats */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-orange-500" />
            <span className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{users.length}</span> abandoned signups
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, or company..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b1554]"
            />
          </div>
        </div>
        <div className="mt-3 text-sm text-gray-600">
          Showing <span className="font-semibold">{startIndex + 1}-{Math.min(endIndex, filteredUsers.length)}</span> of{' '}
          <span className="font-semibold">{filteredUsers.length}</span> users
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHeader<User>
                label="Name"
                sortKey="full_name"
                currentSortKey={sortConfig?.key as keyof User}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
                className="px-4 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              />
              <SortableTableHeader<User>
                label="Email"
                sortKey="email"
                currentSortKey={sortConfig?.key as keyof User}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
                className="px-4 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              />
              <SortableTableHeader<User>
                label="Role"
                sortKey="role"
                currentSortKey={sortConfig?.key as keyof User}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
                className="px-4 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              />
              <SortableTableHeader<User>
                label="Onboarding Step"
                sortKey="onboarding_step"
                currentSortKey={sortConfig?.key as keyof User}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
                className="px-4 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              />
              <SortableTableHeader<User>
                label="Signed Up"
                sortKey="created_at"
                currentSortKey={sortConfig?.key as keyof User}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
                className="px-4 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              />
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                  No abandoned cart users found
                </TableCell>
              </TableRow>
            ) : (
              paginatedUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'N/A'}
                  </TableCell>
                  <TableCell>{user.email || 'N/A'}</TableCell>
                  <TableCell>
                    <Badge className={getRoleBadgeColor(user.role)}>
                      {getRoleDisplayName(user.role)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-orange-600 border-orange-300">
                      {getOnboardingStepLabel(user.onboarding_step)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    <div className="flex flex-col">
                      <span>{formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}</span>
                      <span className="text-xs text-gray-400">
                        {format(new Date(user.created_at), 'MMM d, yyyy')}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setCheckoutDialogUser(user)
                          setCheckoutFirstName(user.first_name || '')
                          setCheckoutLastName(user.last_name || '')
                        }}
                        className="text-green-600 hover:text-green-700 hover:bg-green-50"
                        title="Create checkout link"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteUser(user)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        title="Delete user"
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
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

      {/* Send Checkout Link Dialog */}
      <Dialog open={!!checkoutDialogUser} onOpenChange={(open) => !open && setCheckoutDialogUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Checkout Link</DialogTitle>
            <DialogDescription>
              Create a checkout link for {checkoutDialogUser?.email} to complete their subscription.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="checkout-first-name">First Name (optional)</Label>
                <Input
                  id="checkout-first-name"
                  value={checkoutFirstName}
                  onChange={(e) => setCheckoutFirstName(e.target.value)}
                  placeholder="John"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="checkout-last-name">Last Name (optional)</Label>
                <Input
                  id="checkout-last-name"
                  value={checkoutLastName}
                  onChange={(e) => setCheckoutLastName(e.target.value)}
                  placeholder="Doe"
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="plan-select">Select Plan</Label>
              <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                <SelectTrigger id="plan-select" className="mt-1">
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckoutDialogUser(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendCheckoutLink}
              disabled={sendingCheckoutLink === checkoutDialogUser?.id || !selectedPlan}
              className="bg-[#dd1969] hover:bg-[#c01559]"
            >
              {sendingCheckoutLink === checkoutDialogUser?.id ? 'Creating...' : 'Create Checkout Link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {userToDelete?.full_name || userToDelete?.email}?
              This action cannot be undone and will permanently remove this user account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteUser}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
