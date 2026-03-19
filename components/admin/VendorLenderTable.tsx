'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Edit, Trash2, Mail, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { EditUserModal } from './EditUserModal'
import { AddVendorLenderModal } from './AddVendorLenderModal'
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

interface VendorLender {
  id: string
  email?: string
  full_name?: string
  first_name?: string
  last_name?: string
  phone?: string
  role?: string
  created_at?: string
}

interface VendorLenderTableProps {
  vendorLenders: VendorLender[]
}

export function VendorLenderTable({ vendorLenders }: VendorLenderTableProps) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingVendorLender, setEditingVendorLender] = useState<VendorLender | null>(null)
  const [isSendingReset, setIsSendingReset] = useState(false)
  const [vendorLenderToReset, setVendorLenderToReset] = useState<VendorLender | null>(null)
  const [vendorLenderToDelete, setVendorLenderToDelete] = useState<VendorLender | null>(null)

  const filteredVendorLenders = vendorLenders.filter((vl) => {
    const searchLower = searchTerm.toLowerCase()
    const matchesSearch =
      vl.full_name?.toLowerCase().includes(searchLower) ||
      vl.email?.toLowerCase().includes(searchLower) ||
      vl.role?.toLowerCase().includes(searchLower)

    const matchesRole = roleFilter === 'all' || vl.role === roleFilter

    return matchesSearch && matchesRole
  })

  const handleOpenEditDialog = (vendorLender: VendorLender) => {
    setEditingVendorLender(vendorLender)
    setIsEditDialogOpen(true)
  }

  const handlePasswordReset = async (vendorLender: VendorLender) => {
    if (!vendorLender.email) {
      toast.error('User does not have an email address.')
      return
    }
    setVendorLenderToReset(vendorLender)
  }

  const confirmPasswordReset = async () => {
    if (!vendorLenderToReset?.email) return

    setIsSendingReset(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(vendorLenderToReset.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
      toast.success(`Password reset email sent to ${vendorLenderToReset.email}`)
    } catch (error) {
      console.error('Error sending password reset:', error)
      toast.error('Failed to send password reset email. Please try again.')
    } finally {
      setIsSendingReset(false)
      setVendorLenderToReset(null)
    }
  }

  const handleDeleteVendorLender = async (vendorLender: VendorLender) => {
    setVendorLenderToDelete(vendorLender)
  }

  const confirmDeleteVendorLender = async () => {
    if (!vendorLenderToDelete) return

    try {
      const supabase = createClient()
      const { error } = await supabase.from('profiles').delete().eq('id', vendorLenderToDelete.id)

      if (error) throw error

      toast.success('Vendor/Lender deleted successfully')
      router.refresh()
    } catch (error) {
      console.error('Error deleting vendor/lender:', error)
      toast.error('Failed to delete vendor/lender. Please try again.')
    } finally {
      setVendorLenderToDelete(null)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md">
      <div className="p-6 border-b border-gray-200">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="flex gap-4 items-center flex-1 w-full">
            <Input
              placeholder="Search vendors/lenders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full md:max-w-md"
            />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b1554]"
            >
              <option value="all">All Types</option>
              <option value="Partner Lender">Lenders</option>
              <option value="Partner Vendor">Vendors</option>
            </select>
          </div>
          <Button
            onClick={() => setIsAddDialogOpen(true)}
            className="bg-[#dd1969] hover:bg-[#c01559] whitespace-nowrap"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Vendor/Lender
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Phone
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredVendorLenders.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  No vendors/lenders found
                </td>
              </tr>
            ) : (
              filteredVendorLenders.map((vl) => (
                <tr key={vl.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {vl.full_name || `${vl.first_name} ${vl.last_name}` || 'N/A'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{vl.email || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{vl.phone || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge
                      className={
                        vl.role === 'Partner Lender'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                      }
                    >
                      {vl.role === 'Partner Lender' ? 'Lender' : 'Vendor'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {vl.created_at
                      ? new Date(vl.created_at).toLocaleDateString()
                      : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEditDialog(vl)}
                        className="text-blue-600 hover:text-blue-900 hover:bg-blue-50"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePasswordReset(vl)}
                        disabled={isSendingReset}
                        className="text-green-600 hover:text-green-900 hover:bg-green-50"
                      >
                        <Mail className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteVendorLender(vl)}
                        className="text-red-600 hover:text-red-900 hover:bg-red-50"
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
        user={editingVendorLender}
        isOpen={isEditDialogOpen}
        onClose={() => {
          setIsEditDialogOpen(false)
          setEditingVendorLender(null)
        }}
      />

      <AddVendorLenderModal
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
      />

      {/* Password Reset Confirmation Dialog */}
      <AlertDialog open={!!vendorLenderToReset} onOpenChange={(open) => !open && setVendorLenderToReset(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Password Reset Email?</AlertDialogTitle>
            <AlertDialogDescription>
              This will send a password reset email to {vendorLenderToReset?.email}. The user will receive
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
      <AlertDialog open={!!vendorLenderToDelete} onOpenChange={(open) => !open && setVendorLenderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Vendor/Lender?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {vendorLenderToDelete?.full_name || vendorLenderToDelete?.email}?
              This action cannot be undone and will permanently remove this vendor/lender account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteVendorLender}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Vendor/Lender
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
