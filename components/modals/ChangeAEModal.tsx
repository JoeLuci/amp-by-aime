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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { UserInfoSection } from './shared/UserInfoSection'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface ChangeAEModalProps {
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

const ISSUE_TYPES = [
  'Communication Issues',
  'Response Time',
  'Service Quality',
  'Technical Support',
  'Other'
]

export function ChangeAEModal({ open, onOpenChange, preselectedLenderId }: ChangeAEModalProps) {
  const [loading, setLoading] = useState(false)
  const [lenders, setLenders] = useState<Lender[]>([])
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)

  // Form state
  const [selectedLender, setSelectedLender] = useState('')
  const [accountExecutiveName, setAccountExecutiveName] = useState('')
  const [issueType, setIssueType] = useState('')
  const [description, setDescription] = useState('')
  const [spokenToAE, setSpokenToAE] = useState(false)
  const [lastSpokenToAEDate, setLastSpokenToAEDate] = useState('')

  useEffect(() => {
    if (open) {
      fetchLenders()
      fetchUserProfile()
      // Pre-populate lender if provided
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

    if (!selectedLender || !issueType || !description.trim()) {
      toast.error('Please fill in all required fields')
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
        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/change-ae`
        : '/api/opportunities/change-ae' // Fallback to old API for local dev

      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          lenderId: selectedLender,
          lenderName: selectedLenderData.name,
          accountExecutiveName: accountExecutiveName,
          issueType: issueType,
          issueDescription: description,
          spokenToAE: spokenToAE,
          lastSpokenToAEDate: lastSpokenToAEDate,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit request')
      }

      toast.success('Your request has been submitted successfully')
      resetForm()
      onOpenChange(false)
    } catch (error) {
      console.error('Error submitting request:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to submit request')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setSelectedLender('')
    setAccountExecutiveName('')
    setIssueType('')
    setDescription('')
    setSpokenToAE(false)
    setLastSpokenToAEDate('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Change AE</DialogTitle>
          <DialogDescription>
            Are you having an urgent issue with an account executive?
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold text-sm mb-1">We are here to help.</h3>
              <p className="text-xs text-gray-600">
                Please complete the form below to report an issue. The AIME team will review your request within the same business day if submitted before 4:00 PM ET.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lender">Lender Information</Label>
              <Select value={selectedLender} onValueChange={setSelectedLender} disabled={!!preselectedLenderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an option..." />
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
                <h3 className="font-semibold text-sm mb-2">Your Information</h3>
                <p className="text-xs text-gray-600 mb-3">
                  Please verify your information. You can modify this on Your Profile.
                </p>
                <UserInfoSection
                  fullName={userProfile.full_name}
                  email={userProfile.email}
                  phone={userProfile.phone}
                  nmlsNumber={userProfile.nmls_number}
                  stateLicenses={userProfile.state_licenses}
                />
              </div>
            )}

            <div>
              <h3 className="font-semibold text-sm mb-3">Issue Details</h3>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="ae-name">Account Executive Name</Label>
                  <Input
                    id="ae-name"
                    placeholder="Type here..."
                    value={accountExecutiveName}
                    onChange={(e) => setAccountExecutiveName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="issue-type">Issue</Label>
                  <Select value={issueType} onValueChange={setIssueType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose an option..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ISSUE_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">
                    Describe the issue
                  </Label>
                  <Textarea
                    id="description"
                    placeholder="Description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    required
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="spoken-to-ae"
                    checked={spokenToAE}
                    onCheckedChange={(checked) => setSpokenToAE(checked === true)}
                  />
                  <Label
                    htmlFor="spoken-to-ae"
                    className="text-sm font-normal cursor-pointer"
                  >
                    Have you spoken to your Account Executive about the above issue?
                  </Label>
                </div>

                {spokenToAE && (
                  <div className="space-y-2 ml-6">
                    <Label htmlFor="last-spoken-date">Last Spoken to AE Date</Label>
                    <Input
                      id="last-spoken-date"
                      type="date"
                      value={lastSpokenToAEDate}
                      onChange={(e) => setLastSpokenToAEDate(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>
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
