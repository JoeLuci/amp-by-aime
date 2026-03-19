'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UserInfoSection } from './shared/UserInfoSection'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface VendorConnectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preselectedVendorId?: string
  preselectedVendorName?: string
}

interface Vendor {
  id: string
  name: string
}

interface UserProfile {
  full_name: string
  email: string
  phone?: string
  nmls_number?: string
  state_licenses?: string[]
}

export function VendorConnectionModal({
  open,
  onOpenChange,
  preselectedVendorId,
  preselectedVendorName
}: VendorConnectionModalProps) {
  const [loading, setLoading] = useState(false)
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [selectedVendor, setSelectedVendor] = useState('')

  useEffect(() => {
    if (open) {
      fetchVendors()
      fetchUserProfile()
      if (preselectedVendorId) {
        setSelectedVendor(preselectedVendorId)
      }
    }
  }, [open, preselectedVendorId])

  const fetchVendors = async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('vendors')
      .select('id, name')
      .eq('is_active', true)
      .order('name')

    if (error) {
      console.error('Error fetching vendors:', error)
      toast.error('Failed to load vendor partners')
      return
    }

    setVendors(data || [])
  }

  const fetchUserProfile = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return

    const { data, error } = await supabase
      .from('profiles')
      .select('full_name, email, phone, nmls_number, state_licenses')
      .eq('id', user.id)
      .single()

    if (error) {
      console.error('Error fetching user profile:', error)
      return
    }

    setUserProfile(data)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedVendor) {
      toast.error('Please select a vendor partner')
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()

      // Get session token for Authorization header
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('Not authenticated')
      }

      // Get vendor name - use preselected name if available, otherwise look up from vendors list
      let vendorName: string
      if (preselectedVendorId && preselectedVendorName) {
        vendorName = preselectedVendorName
      } else {
        const selectedVendorData = vendors.find(v => v.id === selectedVendor)
        if (!selectedVendorData) {
          throw new Error('Selected vendor not found')
        }
        vendorName = selectedVendorData.name
      }

      // Call Supabase Edge Function
      const edgeFunctionUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/vendor-connection`
        : '/api/opportunities/vendor-connection' // Fallback to old API for local dev

      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          vendorId: selectedVendor,
          vendorName: vendorName,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit request')
      }

      toast.success('We will put you in touch!')
      setSelectedVendor('')
      onOpenChange(false)
    } catch (error) {
      console.error('Error submitting request:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to submit request')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Connect with an approved vendor partner</DialogTitle>
          <DialogDescription>
            We will put you in touch!
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <p className="text-xs text-gray-600">
              Verify the information below. You can modify this on Your Profile.
            </p>

            <div className="space-y-2">
              <Label htmlFor="vendor">Who would you like to connect with?</Label>
              {preselectedVendorId && preselectedVendorName ? (
                <div className="flex items-center px-3 py-2 bg-gray-100 border border-gray-200 rounded-md">
                  <span className="text-gray-700 font-medium">{preselectedVendorName}</span>
                </div>
              ) : (
                <Select value={selectedVendor} onValueChange={setSelectedVendor}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a Vendor Partner" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((vendor) => (
                      <SelectItem key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {userProfile && (
              <div>
                <h3 className="font-semibold text-sm mb-3">Your Information</h3>
                <UserInfoSection
                  fullName={userProfile.full_name}
                  email={userProfile.email}
                  phone={userProfile.phone}
                  nmlsNumber={userProfile.nmls_number}
                  stateLicenses={userProfile.state_licenses}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-[#dd1969] hover:bg-[#c01558]"
            >
              {loading ? 'Submitting...' : 'Submit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
