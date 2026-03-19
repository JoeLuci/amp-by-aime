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

interface LenderConnectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preselectedLenderId?: string
}

interface Lender {
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

export function LenderConnectionModal({
  open,
  onOpenChange,
  preselectedLenderId
}: LenderConnectionModalProps) {
  const [loading, setLoading] = useState(false)
  const [lenders, setLenders] = useState<Lender[]>([])
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [selectedLender, setSelectedLender] = useState('')

  useEffect(() => {
    if (open) {
      fetchLenders()
      fetchUserProfile()
      if (preselectedLenderId) {
        setSelectedLender(preselectedLenderId)
      }
    }
  }, [open, preselectedLenderId])

  const fetchLenders = async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('lenders')
      .select('id, name')
      .eq('is_active', true)
      .order('name')

    if (error) {
      console.error('Error fetching lenders:', error)
      toast.error('Failed to load lender partners')
      return
    }

    setLenders(data || [])
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

    if (!selectedLender) {
      toast.error('Please select a lender partner')
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

      // Get lender name from selected lender ID
      const selectedLenderData = lenders.find(l => l.id === selectedLender)
      if (!selectedLenderData) {
        throw new Error('Selected lender not found')
      }

      // Call Supabase Edge Function
      const edgeFunctionUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/lender-connection`
        : '/api/opportunities/lender-connection' // Fallback to old API for local dev

      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          lenderId: selectedLender,
          lenderName: selectedLenderData.name,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit request')
      }

      toast.success('We will put you in touch!')
      setSelectedLender('')
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
          <DialogTitle>Connect with an approved lender partner</DialogTitle>
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
              <Label htmlFor="lender">Who would you like to connect with?</Label>
              <Select value={selectedLender} onValueChange={setSelectedLender} disabled={!!preselectedLenderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a Lender Partner" />
                </SelectTrigger>
                <SelectContent>
                  {lenders.map((lender) => (
                    <SelectItem key={lender.id} value={lender.id}>
                      {lender.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
