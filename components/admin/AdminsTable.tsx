'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Edit, Trash2, Mail, Plus, Key } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { EditUserModal } from './EditUserModal'
import { AddAdminModal } from './AddAdminModal'
import { useSortableData } from '@/hooks/useSortableData'
import { SortableTableHeader } from '@/components/ui/sortable-table-header'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
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

interface Admin {
  id: string
  email?: string
  full_name?: string
  first_name?: string
  last_name?: string
  phone?: string
  role?: string
  created_at?: string
  last_login_at?: string
}

interface AdminsTableProps {
  admins: Admin[]
}

export function AdminsTable({ admins }: AdminsTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchTerm, setSearchTerm] = useState('')
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingAdmin, setEditingAdmin] = useState<Admin | null>(null)
  const [isSendingReset, setIsSendingReset] = useState(false)
  const [adminToReset, setAdminToReset] = useState<Admin | null>(null)
  const [adminToDelete, setAdminToDelete] = useState<Admin | null>(null)
  const [adminToManualReset, setAdminToManualReset] = useState<Admin | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [isResettingPassword, setIsResettingPassword] = useState(false)

  // Handle opening editor from URL parameter (e.g., from search results)
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (editId) {
      const adminToEdit = admins.find(a => a.id === editId)
      if (adminToEdit) {
        handleOpenEditDialog(adminToEdit)
        // Clean up the URL parameter
        router.replace('/admin/admins', { scroll: false })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const filteredAdmins = admins.filter((admin) => {
    const searchLower = searchTerm.toLowerCase()
    return (
      admin.full_name?.toLowerCase().includes(searchLower) ||
      admin.email?.toLowerCase().includes(searchLower) ||
      admin.role?.toLowerCase().includes(searchLower)
    )
  })

  // Apply sorting to filtered data
  const { items: sortedAdmins, requestSort, sortConfig } = useSortableData(filteredAdmins)

  const handleOpenEditDialog = (admin: Admin) => {
    setEditingAdmin(admin)
    setIsEditDialogOpen(true)
  }

  const handlePasswordReset = async (admin: Admin) => {
    if (!admin.email) {
      toast.error('Admin does not have an email address.')
      return
    }
    setAdminToReset(admin)
  }

  const confirmPasswordReset = async () => {
    if (!adminToReset?.email) return

    setIsSendingReset(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(adminToReset.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
      toast.success(`Password reset email sent to ${adminToReset.email}`)
    } catch (error) {
      console.error('Error sending password reset:', error)
      toast.error('Failed to send password reset email. Please try again.')
    } finally {
      setIsSendingReset(false)
      setAdminToReset(null)
    }
  }

  const handleDeleteAdmin = async (admin: Admin) => {
    setAdminToDelete(admin)
  }

  const confirmDeleteAdmin = async () => {
    if (!adminToDelete) return

    try {
      const supabase = createClient()
      const { error } = await supabase.from('profiles').delete().eq('id', adminToDelete.id)

      if (error) throw error

      toast.success('Admin deleted successfully')
      router.refresh()
    } catch (error) {
      console.error('Error deleting admin:', error)
      toast.error('Failed to delete admin. Please try again.')
    } finally {
      setAdminToDelete(null)
    }
  }

  const handleManualPasswordReset = (admin: Admin) => {
    setAdminToManualReset(admin)
    setNewPassword('')
  }

  const confirmManualPasswordReset = async () => {
    if (!adminToManualReset || !newPassword) return

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
          user_id: adminToManualReset.id,
          new_password: newPassword,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset password')
      }

      toast.success(`Password reset successfully for ${adminToManualReset.email}`)
      setAdminToManualReset(null)
      setNewPassword('')
    } catch (error: any) {
      console.error('Error resetting password:', error)
      toast.error(error.message || 'Failed to reset password. Please try again.')
    } finally {
      setIsResettingPassword(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md">
      <div className="p-6 border-b border-gray-200">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="flex-1 w-full md:max-w-md">
            <Input
              placeholder="Search admins..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>
          <Button
            onClick={() => setIsAddDialogOpen(true)}
            className="bg-[#dd1969] hover:bg-[#c01559] whitespace-nowrap"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Admin
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <SortableTableHeader<Admin>
                label="Name"
                sortKey="full_name"
                currentSortKey={sortConfig?.key as keyof Admin}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
              />
              <SortableTableHeader<Admin>
                label="Email"
                sortKey="email"
                currentSortKey={sortConfig?.key as keyof Admin}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
              />
              <SortableTableHeader<Admin>
                label="Role"
                sortKey="role"
                currentSortKey={sortConfig?.key as keyof Admin}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
              />
              <SortableTableHeader<Admin>
                label="Created"
                sortKey="created_at"
                currentSortKey={sortConfig?.key as keyof Admin}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
              />
              <SortableTableHeader<Admin>
                label="Last Login"
                sortKey="last_login_at"
                currentSortKey={sortConfig?.key as keyof Admin}
                currentSortDirection={sortConfig?.direction || null}
                onSort={requestSort}
              />
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedAdmins.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  No admins found
                </td>
              </tr>
            ) : (
              sortedAdmins.map((admin) => (
                <tr key={admin.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {admin.full_name || `${admin.first_name} ${admin.last_name}` || 'N/A'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{admin.email || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge
                      className={
                        admin.role === 'super_admin'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-purple-100 text-purple-800'
                      }
                    >
                      {getRoleDisplayName(admin.role)}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {admin.created_at
                      ? new Date(admin.created_at).toLocaleDateString()
                      : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {admin.last_login_at
                      ? formatDistanceToNow(new Date(admin.last_login_at), { addSuffix: true })
                      : <span className="text-gray-400">Never</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEditDialog(admin)}
                        className="text-blue-600 hover:text-blue-900 hover:bg-blue-50"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePasswordReset(admin)}
                        disabled={isSendingReset}
                        className="text-green-600 hover:text-green-900 hover:bg-green-50"
                        title="Send password reset email"
                      >
                        <Mail className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleManualPasswordReset(admin)}
                        className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                        title="Set new password manually"
                      >
                        <Key className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteAdmin(admin)}
                        className="text-red-600 hover:text-red-900 hover:bg-red-50"
                        title="Delete admin"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <EditUserModal
        user={editingAdmin}
        isOpen={isEditDialogOpen}
        onClose={() => {
          setIsEditDialogOpen(false)
          setEditingAdmin(null)
        }}
      />

      <AddAdminModal
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
      />

      {/* Password Reset Confirmation Dialog */}
      <AlertDialog open={!!adminToReset} onOpenChange={(open) => !open && setAdminToReset(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Password Reset Email?</AlertDialogTitle>
            <AlertDialogDescription>
              This will send a password reset email to {adminToReset?.email}. The admin will receive
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
      <AlertDialog open={!!adminToDelete} onOpenChange={(open) => !open && setAdminToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Admin?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {adminToDelete?.full_name || adminToDelete?.email}?
              This action cannot be undone and will permanently remove this admin account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteAdmin}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Admin
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manual Password Reset Dialog */}
      <Dialog open={!!adminToManualReset} onOpenChange={(open) => { if (!open) { setAdminToManualReset(null); setNewPassword(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set New Password</DialogTitle>
            <DialogDescription>
              Set a new password for {adminToManualReset?.full_name || adminToManualReset?.email}.
              The admin will be able to log in immediately with this password.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="admin-new-password">New Password</Label>
            <Input
              id="admin-new-password"
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
              onClick={() => { setAdminToManualReset(null); setNewPassword(''); }}
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
    </div>
  )
}
