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
import { AlertCircle, CheckCircle2 } from 'lucide-react'

interface AddUserWithStripeModalProps {
  isOpen: boolean
  onClose: () => void
}

export function AddUserWithStripeModal({ isOpen, onClose }: AddUserWithStripeModalProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    password: '',
    stripe_customer_id: '',
    stripe_subscription_id: '',
    plan_tier: '',
    role: 'member',
  })

  const handleSubmit = async () => {
    // Validate required fields
    if (!formData.first_name || !formData.last_name || !formData.email || !formData.password) {
      toast.error('Please fill in all required fields')
      return
    }

    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    if (!formData.stripe_customer_id && !formData.stripe_subscription_id) {
      toast.error('Please provide either a Stripe Customer ID or Subscription ID')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/admin/create-user-with-stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user')
      }

      toast.success(`User created successfully! Plan: ${data.stripe?.plan_tier || 'N/A'}`)
      router.refresh()
      resetForm()
      onClose()
    } catch (error: any) {
      console.error('Error creating user:', error)
      toast.error(error.message || 'Failed to create user. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      password: '',
      stripe_customer_id: '',
      stripe_subscription_id: '',
      plan_tier: '',
      role: 'member',
    })
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add User with Existing Stripe Subscription</DialogTitle>
          <DialogDescription>
            Create a new user account and link it to an existing Stripe subscription.
            The user will have immediate access without going through checkout.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Info banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium">How it works:</p>
              <ul className="mt-1 list-disc list-inside space-y-1">
                <li>Enter the Stripe Customer ID or Subscription ID</li>
                <li>We'll fetch the subscription details from Stripe</li>
                <li>User will be created with their subscription already active</li>
              </ul>
            </div>
          </div>

          {/* Stripe IDs */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            <h4 className="font-medium text-gray-900">Stripe Information</h4>

            <div className="space-y-2">
              <Label htmlFor="stripe_customer_id">Stripe Customer ID</Label>
              <Input
                id="stripe_customer_id"
                value={formData.stripe_customer_id}
                onChange={(e) => setFormData({ ...formData, stripe_customer_id: e.target.value })}
                placeholder="cus_xxxxxxxxxxxxx"
              />
              <p className="text-xs text-gray-500">Found in Stripe Dashboard → Customers</p>
            </div>

            <div className="text-center text-gray-400 text-sm">- or -</div>

            <div className="space-y-2">
              <Label htmlFor="stripe_subscription_id">Stripe Subscription ID</Label>
              <Input
                id="stripe_subscription_id"
                value={formData.stripe_subscription_id}
                onChange={(e) => setFormData({ ...formData, stripe_subscription_id: e.target.value })}
                placeholder="sub_xxxxxxxxxxxxx"
              />
              <p className="text-xs text-gray-500">Found in Stripe Dashboard → Subscriptions</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="plan_tier">Plan Tier (Optional)</Label>
              <select
                id="plan_tier"
                value={formData.plan_tier}
                onChange={(e) => setFormData({ ...formData, plan_tier: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b1554]"
              >
                <option value="">Auto-detect from Stripe</option>
                <option value="VIP">VIP</option>
                <option value="VIP Processor">VIP Processor</option>
                <option value="Elite">Elite</option>
                <option value="Elite Processor">Elite Processor</option>
                <option value="Premium">Premium</option>
                <option value="Premium Processor">Premium Processor</option>
                <option value="Premium Guest">Premium Guest</option>
              </select>
            </div>
          </div>

          {/* User Details */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">User Details</h4>

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

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b1554]"
              >
                <option value="member">Member</option>
                <option value="loan_officer">Loan Officer</option>
                <option value="broker_owner">Broker Owner</option>
                <option value="loan_officer_assistant">Loan Officer Assistant</option>
                <option value="processor">Processor</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Minimum 6 characters"
                required
              />
              <p className="text-xs text-gray-500">
                User can change their password after first login
              </p>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 bg-[#dd1969] hover:bg-[#c01559]"
            >
              {isSubmitting ? 'Creating...' : 'Create User & Link Subscription'}
            </Button>
            <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
