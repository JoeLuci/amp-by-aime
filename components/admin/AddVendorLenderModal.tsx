'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface AddVendorLenderModalProps {
  isOpen: boolean
  onClose: () => void
}

export function AddVendorLenderModal({ isOpen, onClose }: AddVendorLenderModalProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    role: 'partner_vendor',
    company_name: '',
    escalations_contact_name: '',
    escalations_contact_email: '',
    escalations_contact_phone: '',
  })

  const handleSubmit = async () => {
    // Validate required fields
    if (!formData.first_name || !formData.last_name || !formData.email || !formData.company_name) {
      toast.error('Please fill in all required fields')
      return
    }

    // Validate escalations contact for lenders
    if (formData.role === 'partner_lender') {
      if (!formData.escalations_contact_name || !formData.escalations_contact_email || !formData.escalations_contact_phone) {
        toast.error('Please fill in Escalations Contact information for lenders')
        return
      }
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/admin/create-vendor-lender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create vendor/lender')
      }

      toast.success('Vendor/Lender created! An invite email has been sent.')
      router.refresh()
      setFormData({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        role: 'partner_vendor',
        company_name: '',
        escalations_contact_name: '',
        escalations_contact_email: '',
        escalations_contact_phone: '',
      })
      onClose()
    } catch (error: any) {
      console.error('Error creating vendor/lender:', error)
      toast.error(error.message || 'Failed to create vendor/lender. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New {formData.role === 'partner_vendor' ? 'Vendor' : 'Lender'}</DialogTitle>
          <DialogDescription>
            Create a new {formData.role === 'partner_vendor' ? 'vendor' : 'lender'} account with contact information
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Type Selection */}
          <div className="space-y-2">
            <Label htmlFor="role">Type *</Label>
            <select
              id="role"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b1554]"
              required
            >
              <option value="partner_vendor">Vendor</option>
              <option value="partner_lender">Lender</option>
            </select>
          </div>

          {/* Company Name */}
          <div className="space-y-2">
            <Label htmlFor="company_name">Company Name *</Label>
            <Input
              id="company_name"
              value={formData.company_name}
              onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
              required
            />
          </div>

          {/* Primary User Info */}
          <div className="border-t pt-4">
            <h3 className="font-semibold text-gray-900 mb-4">Primary User Account</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First Name *</Label>
                  <Input
                    id="first_name"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="last_name">Last Name *</Label>
                  <Input
                    id="last_name"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(555) 555-5555"
                  />
                </div>
              </div>

              <p className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
                An invite email will be sent to the user to set their own password.
              </p>
            </div>
          </div>

          {/* Escalations Contact (Lenders only) */}
          {formData.role === 'partner_lender' && (
            <div className="border-t pt-4">
              <h3 className="font-semibold text-gray-900 mb-4">Escalations Contact *</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="escalations_contact_name">Contact Name *</Label>
                  <Input
                    id="escalations_contact_name"
                    value={formData.escalations_contact_name}
                    onChange={(e) => setFormData({ ...formData, escalations_contact_name: e.target.value })}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="escalations_contact_email">Contact Email *</Label>
                    <Input
                      id="escalations_contact_email"
                      type="email"
                      value={formData.escalations_contact_email}
                      onChange={(e) => setFormData({ ...formData, escalations_contact_email: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="escalations_contact_phone">Contact Phone *</Label>
                    <Input
                      id="escalations_contact_phone"
                      type="tel"
                      value={formData.escalations_contact_phone}
                      onChange={(e) => setFormData({ ...formData, escalations_contact_phone: e.target.value })}
                      placeholder="(555) 555-5555"
                      required
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-4 border-t">
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 bg-[#dd1969] hover:bg-[#c01559]"
            >
              {isSubmitting ? 'Creating...' : `Create ${formData.role === 'partner_vendor' ? 'Vendor' : 'Lender'}`}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
