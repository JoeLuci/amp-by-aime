'use client'

import { useState, useEffect } from 'react'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DialogClose } from '@radix-ui/react-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Edit, Trash2, Search, Mail, ChevronLeft, ChevronRight, Key, Plus, UserCheck } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { EditUserModal } from './EditUserModal'
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
import { AddUserWithStripeModal } from './AddUserWithStripeModal'

interface User {
  id: string
  email?: string
  full_name?: string
  first_name?: string
  last_name?: string
  role?: string
  company?: string
  company_name?: string
  phone?: string
  plan_tier?: string
  subscription_status?: string
  stripe_customer_id?: string
  stripe_subscription_id?: string
  subscription_end_date?: string
  escalations_remaining?: number
  created_at: string
  last_login_at?: string
  has_completed_trial?: boolean
  engagement_level?: string
  engagement_score?: number
}

interface UsersTableProps {
  users: User[]
  isSuperAdmin?: boolean
}

export function UsersTable({ users, isSuperAdmin = false }: UsersTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [tierFilter, setTierFilter] = useState<string>('all')
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [isSendingReset, setIsSendingReset] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20
  const [userToReset, setUserToReset] = useState<User | null>(null)
  const [userToDelete, setUserToDelete] = useState<User | null>(null)
  const [userToManualReset, setUserToManualReset] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [isResettingPassword, setIsResettingPassword] = useState(false)
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false)
  const [userToImpersonate, setUserToImpersonate] = useState<User | null>(null)
  const [isImpersonating, setIsImpersonating] = useState(false)

  // Handle search parameter from URL (e.g., from email notification links)
  useEffect(() => {
    const searchQuery = searchParams.get('search')
    if (searchQuery) {
      setSearchTerm(searchQuery)
      // Clean up the URL parameter
      router.replace('/admin/users', { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle opening editor from URL parameter (e.g., from search results)
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (editId) {
      const userToEdit = users.find(u => u.id === editId)
      if (userToEdit) {
        handleOpenEditDialog(userToEdit)
        // Clean up the URL parameter
        router.replace('/admin/users', { scroll: false })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Filter users based on search, role, and tier
  // Exclude vendor/lender partners - they are managed in the Vendors/Lenders tab
  const filteredUsers = users.filter((user) => {
    // Exclude partner vendors and lenders from this table
    if (user.role === 'partner_vendor' || user.role === 'partner_lender') {
      return false
    }

    const matchesSearch =
      searchTerm === '' ||
      user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.company_name?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesRole = roleFilter === 'all' || user.role === roleFilter

    // Tier filter logic
    const matchesTier = tierFilter === 'all' || user.plan_tier === tierFilter

    return matchesSearch && matchesRole && matchesTier
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

  const handleRoleFilterChange = (value: string) => {
    setRoleFilter(value)
    setCurrentPage(1)
  }

  const handleTierFilterChange = (value: string) => {
    setTierFilter(value)
    setCurrentPage(1)
  }

  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case 'super_admin':
        return 'bg-purple-100 text-purple-800'
      case 'admin':
        return 'bg-red-100 text-red-800'
      case 'broker_owner':
        return 'bg-orange-100 text-orange-800'
      case 'partner_lender':
        return 'bg-green-100 text-green-800'
      case 'partner_vendor':
        return 'bg-yellow-100 text-yellow-800'
      case 'member':
        return 'bg-blue-100 text-blue-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getTierBadgeColor = (tier?: string) => {
    if (!tier) return 'bg-gray-100 text-gray-800'
    const tierLower = tier.toLowerCase()
    if (tierLower.includes('vip')) return 'bg-yellow-100 text-yellow-800'
    if (tierLower.includes('elite')) return 'bg-indigo-100 text-indigo-800'
    if (tierLower.includes('premium')) return 'bg-green-100 text-green-800'
    return 'bg-gray-100 text-gray-800'
  }

  const getEngagementBadgeColor = (level?: string) => {
    switch (level) {
      case 'Super Member':
        return 'bg-green-100 text-green-800'
      case 'Engaged Member':
        return 'bg-blue-100 text-blue-800'
      case 'Unengaged Member':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-500'
    }
  }

  const handleOpenEditDialog = (user: User) => {
    setEditingUser(user)
    setIsEditDialogOpen(true)
  }

  const handleCloseEditDialog = () => {
    setIsEditDialogOpen(false)
    setEditingUser(null)
  }

  const handlePasswordReset = async (user: User) => {
    if (!user.email) {
      toast.error('User does not have an email address.')
      return
    }
    setUserToReset(user)
  }

  const confirmPasswordReset = async () => {
    if (!userToReset?.email) return

    setIsSendingReset(true)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(userToReset.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) throw error

      toast.success(`Password reset email sent to ${userToReset.email}`)
    } catch (error) {
      console.error('Error sending password reset:', error)
      toast.error('Failed to send password reset email. Please try again.')
    } finally {
      setIsSendingReset(false)
      setUserToReset(null)
    }
  }

  const handleDeleteUser = async (user: User) => {
    setUserToDelete(user)
  }

  const confirmDeleteUser = async () => {
    if (!userToDelete) return

    try {
      const response = await fetch(`/api/admin/users/${userToDelete.id}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete user')
      }

      toast.success('User deleted successfully')
      router.refresh()
    } catch (error: any) {
      console.error('Error deleting user:', error)
      toast.error(error.message || 'Failed to delete user. Please try again.')
    } finally {
      setUserToDelete(null)
    }
  }

  // Handle Login As (impersonation)
  const handleLoginAs = (user: User) => {
    setUserToImpersonate(user)
  }

  const confirmLoginAs = async () => {
    if (!userToImpersonate) return

    setIsImpersonating(true)
    try {
      const response = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: userToImpersonate.id })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start impersonation')
      }

      toast.success(`Now viewing as ${userToImpersonate.full_name || userToImpersonate.email}`)
      router.push('/dashboard')
    } catch (error: any) {
      console.error('Error starting impersonation:', error)
      toast.error(error.message || 'Failed to login as user')
    } finally {
      setIsImpersonating(false)
      setUserToImpersonate(null)
    }
  }

  const handleManualPasswordReset = (user: User) => {
    setUserToManualReset(user)
    setNewPassword('')
  }

  const confirmManualPasswordReset = async () => {
    if (!userToManualReset || !newPassword) return

    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    setIsResettingPassword(true)

    try {
      const response = await fetch('/api/admin/reset-user-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userToManualReset.id,
          new_password: newPassword,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset password')
      }

      toast.success(`Password reset successfully for ${userToManualReset.email}`)
      setUserToManualReset(null)
      setNewPassword('')
    } catch (error: any) {
      console.error('Error resetting password:', error)
      toast.error(error.message || 'Failed to reset password. Please try again.')
    } finally {
      setIsResettingPassword(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow">
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
          <select
            value={roleFilter}
            onChange={(e) => handleRoleFilterChange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b1554]"
          >
            <option value="all">All Roles</option>
            <option value="loan_officer">Loan Officer</option>
            <option value="broker_owner">Broker Owner</option>
            <option value="loan_officer_assistant">Loan Officer Assistant</option>
            <option value="processor">Processor</option>
          </select>
          <select
            value={tierFilter}
            onChange={(e) => handleTierFilterChange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b1554]"
          >
            <option value="all">All Tiers</option>
            <option value="VIP">VIP</option>
            <option value="VIP Processor">VIP Processor</option>
            <option value="Elite">Elite</option>
            <option value="Elite Processor">Elite Processor</option>
            <option value="Premium">Premium</option>
            <option value="Premium Processor">Premium Processor</option>
            <option value="Premium Guest">Premium Guest</option>
          </select>
          <Button
            onClick={() => setIsAddUserModalOpen(true)}
            className="bg-[#dd1969] hover:bg-[#c01559] whitespace-nowrap"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add User
          </Button>
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
                label="Company"
                sortKey="company"
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
                label="Tier"
                sortKey="plan_tier"
                currentSortKey={sortConfig?.key as keyof User}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
                className="px-4 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              />
              <SortableTableHeader<User>
                label="Engagement"
                sortKey="engagement_level"
                currentSortKey={sortConfig?.key as keyof User}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
                className="px-4 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              />
              <SortableTableHeader<User>
                label="Last Login"
                sortKey="last_login_at"
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
                <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              paginatedUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.full_name || 'N/A'}
                  </TableCell>
                  <TableCell>{user.email || 'N/A'}</TableCell>
                  <TableCell>{user.company || user.company_name || 'N/A'}</TableCell>
                  <TableCell>
                    <Badge className={getRoleBadgeColor(user.role)}>
                      {getRoleDisplayName(user.role)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={getTierBadgeColor(user.plan_tier)}>
                      {user.plan_tier || 'None'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {user.engagement_level ? (
                        <Badge className={getEngagementBadgeColor(user.engagement_level)}>
                          {user.engagement_level}
                        </Badge>
                      ) : (
                        <span className="text-gray-400 text-sm">Not set</span>
                      )}
                      {user.engagement_score !== undefined && user.engagement_score !== null && (
                        <span className="text-xs text-gray-500">{user.engagement_score} pts</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {user.last_login_at
                      ? formatDistanceToNow(new Date(user.last_login_at), { addSuffix: true })
                      : <span className="text-gray-400">Never</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEditDialog(user)}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        title="Edit user"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleLoginAs(user)}
                        className="text-green-600 hover:text-green-700 hover:bg-green-50"
                        title="Login as this user"
                      >
                        <UserCheck className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePasswordReset(user)}
                        disabled={isSendingReset}
                        className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                        title="Send password reset email"
                      >
                        <Mail className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleManualPasswordReset(user)}
                        className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                        title="Set new password manually"
                      >
                        <Key className="w-4 h-4" />
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

      {/* Edit User Modal */}
      <EditUserModal
        user={editingUser}
        isOpen={isEditDialogOpen}
        onClose={handleCloseEditDialog}
        isSuperAdmin={isSuperAdmin}
        subscriptionRedirectUrl="/admin/subscriptions"
      />

      {/* Password Reset Confirmation Dialog */}
      <AlertDialog open={!!userToReset} onOpenChange={(open) => !open && setUserToReset(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Password Reset Email?</AlertDialogTitle>
            <AlertDialogDescription>
              This will send a password reset email to {userToReset?.email}. The user will receive
              instructions to reset their password.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSendingReset}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmPasswordReset}
              disabled={isSendingReset}
              className="bg-[#dd1969] hover:bg-[#c01559]"
            >
              {isSendingReset ? 'Sending...' : 'Send Reset Email'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* Login As (Impersonation) Confirmation Dialog */}
      <AlertDialog open={!!userToImpersonate} onOpenChange={(open) => !open && setUserToImpersonate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Login As User?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to view the dashboard as <strong>{userToImpersonate?.full_name || userToImpersonate?.email}</strong>.
              <br /><br />
              You will see exactly what this user sees - their data, settings, and dashboard.
              A red banner will indicate you are in impersonation mode.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isImpersonating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmLoginAs}
              disabled={isImpersonating}
              className="bg-green-600 hover:bg-green-700"
            >
              {isImpersonating ? 'Loading...' : 'Login As User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manual Password Reset Dialog */}
      <Dialog open={!!userToManualReset} onOpenChange={(open) => { if (!open) { setUserToManualReset(null); setNewPassword(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set New Password</DialogTitle>
            <DialogDescription>
              Set a new password for {userToManualReset?.full_name || userToManualReset?.email}.
              The user will be able to log in immediately with this password.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              placeholder="Enter new password (min 8 characters)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setUserToManualReset(null); setNewPassword(''); }}
              disabled={isResettingPassword}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmManualPasswordReset}
              disabled={isResettingPassword || newPassword.length < 8}
              className="bg-[#dd1969] hover:bg-[#c01559]"
            >
              {isResettingPassword ? 'Resetting...' : 'Set Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add User with Stripe Modal */}
      <AddUserWithStripeModal
        isOpen={isAddUserModalOpen}
        onClose={() => setIsAddUserModalOpen(false)}
      />
    </div>
  )
}
