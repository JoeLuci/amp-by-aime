'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRouter } from 'next/navigation'
import { Eye, X } from 'lucide-react'
import { toast } from 'sonner'

interface ViewAsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Map of display names to database enum values
const USER_ROLES = [
  { label: 'Loan Officer', value: 'loan_officer' },
  { label: 'Broker Owner', value: 'broker_owner' },
  { label: 'Loan Officer Assistant', value: 'loan_officer_assistant' },
  { label: 'Processor', value: 'processor' },
  { label: 'Partner Lender', value: 'partner_lender' },
  { label: 'Partner Vendor', value: 'partner_vendor' },
]

// Standard plan tiers (for Loan Officer, Broker Owner, Loan Officer Assistant)
const STANDARD_PLAN_TIERS = [
  'Premium Guest',
  'Premium',
  'Elite',
  'VIP',
]

// Processor plan tiers (for Processor role)
const PROCESSOR_PLAN_TIERS = [
  'Premium Guest',
  'Premium Processor',
  'Elite Processor',
  'VIP Processor',
]

// Partner plan tiers (for Partner Vendor, Partner Lender)
const PARTNER_PLAN_TIERS = [
  'None',
]

export function ViewAsModal({ open, onOpenChange }: ViewAsModalProps) {
  const router = useRouter()
  const [selectedRole, setSelectedRole] = useState<string>('loan_officer')
  const [selectedPlanTier, setSelectedPlanTier] = useState<string>('Premium')
  const [loading, setLoading] = useState(false)

  // Get available plan tiers based on selected role
  const getAvailablePlanTiers = () => {
    if (selectedRole === 'partner_vendor' || selectedRole === 'partner_lender') {
      return PARTNER_PLAN_TIERS
    }
    if (selectedRole === 'processor') {
      return PROCESSOR_PLAN_TIERS
    }
    return STANDARD_PLAN_TIERS
  }
  const availablePlanTiers = getAvailablePlanTiers()

  // Get display label for selected role
  const getSelectedRoleLabel = () => {
    const role = USER_ROLES.find(r => r.value === selectedRole)
    return role?.label || selectedRole
  }

  // Update plan tier when role changes to ensure valid selection
  useEffect(() => {
    if (selectedRole === 'partner_vendor' || selectedRole === 'partner_lender') {
      // Partners always have Free tier
      setSelectedPlanTier('None')
    } else if (selectedRole === 'processor') {
      // Switch to processor tier if current tier is not a processor tier
      if (!PROCESSOR_PLAN_TIERS.includes(selectedPlanTier)) {
        setSelectedPlanTier('Premium Processor')
      }
    } else {
      // Switch to standard tier if current tier is not a standard tier
      if (!STANDARD_PLAN_TIERS.includes(selectedPlanTier)) {
        setSelectedPlanTier('Premium')
      }
    }
  }, [selectedRole])

  const handleViewAs = async () => {
    setLoading(true)
    try {
      // Call API to set view-as cookie
      const response = await fetch('/api/admin/view-as', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: selectedRole,
          plan_tier: selectedPlanTier
        })
      })

      if (!response.ok) {
        throw new Error('Failed to set view-as mode')
      }

      // Navigate to user dashboard
      router.push('/dashboard')
      router.refresh()

      onOpenChange(false)
    } catch (error) {
      console.error('Error setting view-as mode:', error)
      toast.error('Failed to enable preview mode')
    } finally {
      setLoading(false)
    }
  }

  const handleClearViewAs = async () => {
    try {
      await fetch('/api/admin/view-as', { method: 'DELETE' })
      router.refresh()
      onOpenChange(false)
    } catch (error) {
      console.error('Error clearing view-as:', error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-[#dd1969]">View Portal As...</DialogTitle>
          <DialogDescription className="text-gray-600">
            Select a role and plan tier to view the portal from a user's perspective
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Role Selection */}
          <div className="space-y-2">
            <Label htmlFor="role" className="text-sm font-semibold text-gray-700">
              User Role
            </Label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger id="role" className="w-full">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {USER_ROLES.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              This determines which role-specific content they can see
            </p>
          </div>

          {/* Plan Tier Selection */}
          <div className="space-y-2">
            <Label htmlFor="plan-tier" className="text-sm font-semibold text-gray-700">
              Plan Tier
            </Label>
            <Select value={selectedPlanTier} onValueChange={setSelectedPlanTier}>
              <SelectTrigger id="plan-tier" className="w-full">
                <SelectValue placeholder="Select a plan tier" />
              </SelectTrigger>
              <SelectContent>
                {availablePlanTiers.map((tier) => (
                  <SelectItem key={tier} value={tier}>
                    {tier}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              This determines which premium content they can access
            </p>
          </div>

          {/* Preview Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-blue-900 mb-2">Preview Mode</p>
            <p className="text-xs text-blue-700">
              You'll see the portal as a <span className="font-semibold">{getSelectedRoleLabel()}</span> with a{' '}
              <span className="font-semibold">{selectedPlanTier}</span> plan. You can return to admin view at any time.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            onClick={handleViewAs}
            disabled={loading}
            className="flex-1 bg-[#dd1969] hover:bg-[#c01559] text-white font-semibold"
          >
            <Eye className="w-4 h-4 mr-2" />
            {loading ? 'Loading...' : 'View Portal'}
          </Button>
          <Button
            onClick={handleClearViewAs}
            variant="outline"
            className="flex-1"
          >
            <X className="w-4 h-4 mr-2" />
            Clear View Mode
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
