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

interface EscalateLoanModalProps {
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

const LOAN_TYPES = [
  'Conventional',
  'FHA',
  'VA',
  'USDA',
  'Jumbo',
  'Non-QM',
  'Other'
]

const LOAN_PURPOSES = [
  'Purchase',
  'Refinance',
  'Cash-Out Refinance',
  'Construction',
  'Home Equity',
  'Other'
]

const ISSUE_TYPES = [
  'Communication Issues',
  'Processing Delays',
  'Underwriting Issues',
  'Closing Delays',
  'Documentation Issues',
  'Rate Lock Issues',
  'Other'
]

export function EscalateLoanModal({
  open,
  onOpenChange,
  preselectedLenderId
}: EscalateLoanModalProps) {
  const [loading, setLoading] = useState(false)
  const [lenders, setLenders] = useState<Lender[]>([])
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)

  // Form state
  const [selectedLender, setSelectedLender] = useState('')
  const [loanNumber, setLoanNumber] = useState('')
  const [loanType, setLoanType] = useState('')
  const [loanPurpose, setLoanPurpose] = useState('')
  const [borrowerLastName, setBorrowerLastName] = useState('')
  const [subjectPropertyState, setSubjectPropertyState] = useState('')
  const [submissionDate, setSubmissionDate] = useState('')
  const [closingDate, setClosingDate] = useState('')
  const [lockExpirationDate, setLockExpirationDate] = useState('')
  const [loanAmount, setLoanAmount] = useState('')
  const [accountExecutiveName, setAccountExecutiveName] = useState('')
  const [issueType, setIssueType] = useState('')
  const [description, setDescription] = useState('')
  const [spokenToAE, setSpokenToAE] = useState(false)
  const [lastSpokenToAEDate, setLastSpokenToAEDate] = useState('')
  const [crNumber, setCrNumber] = useState('')
  const [crDate, setCrDate] = useState('')

  // Check if selected lender is UWM
  const selectedLenderData = lenders.find(l => l.id === selectedLender)
  const isUWM = selectedLenderData?.name?.toLowerCase().includes('united wholesale mortgage') ||
                selectedLenderData?.name?.toLowerCase() === 'uwm'

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

    if (!selectedLender || !loanAmount || !issueType || !description.trim()) {
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
        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/escalate-loan`
        : '/api/opportunities/escalate-loan' // Fallback to old API for local dev

      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          lenderId: selectedLender,
          lenderName: selectedLenderData.name,
          partnerName: selectedLenderData.name,
          partnerType: 'lender',
          loanNumber: loanNumber,
          loanType: loanType,
          loanPurpose: loanPurpose,
          loanAmount: loanAmount,
          borrowerLastName: borrowerLastName,
          subjectPropertyState: subjectPropertyState,
          submissionDate: submissionDate,
          closingDate: closingDate,
          lockExpirationDate: lockExpirationDate,
          accountExecutiveName: accountExecutiveName,
          issueType: issueType,
          issueDescription: description,
          spokenToAE: spokenToAE,
          lastSpokenToAEDate: lastSpokenToAEDate,
          crNumber: crNumber,
          crDate: crDate,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit escalation')
      }

      toast.success('Your loan escalation has been submitted successfully')
      resetForm()
      onOpenChange(false)
    } catch (error) {
      console.error('Error submitting escalation:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to submit escalation')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setSelectedLender('')
    setLoanNumber('')
    setLoanType('')
    setLoanPurpose('')
    setLoanAmount('')
    setBorrowerLastName('')
    setSubjectPropertyState('')
    setSubmissionDate('')
    setClosingDate('')
    setLockExpirationDate('')
    setAccountExecutiveName('')
    setIssueType('')
    setDescription('')
    setSpokenToAE(false)
    setLastSpokenToAEDate('')
    setCrNumber('')
    setCrDate('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Escalate loan</DialogTitle>
          <DialogDescription>
            Are you having an urgent issue with a participating lender partner?
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold text-sm mb-1">We are here to help.</h3>
              <p className="text-xs text-gray-600">
                Complete the form below to report an issue. The AIME team will review within the same business day if submitted before 4:00 PM ET.
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
                <h3 className="font-semibold text-sm mb-2">Originator Details</h3>
                <p className="text-xs text-gray-600 mb-2">
                  Verify your information below.
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
              <h3 className="font-semibold text-sm mb-2">Loan Details</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="loan-number">Loan Number</Label>
                    <Input
                      id="loan-number"
                      placeholder="Type here..."
                      value={loanNumber}
                      onChange={(e) => setLoanNumber(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="loan-type">Loan Type</Label>
                    <Select value={loanType} onValueChange={setLoanType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose an option..." />
                      </SelectTrigger>
                      <SelectContent>
                        {LOAN_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {isUWM && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="cr-number">CR Number</Label>
                      <Input
                        id="cr-number"
                        placeholder="Type here..."
                        value={crNumber}
                        onChange={(e) => setCrNumber(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="cr-date">CR Date</Label>
                      <Input
                        id="cr-date"
                        type="date"
                        value={crDate}
                        onChange={(e) => setCrDate(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="loan-purpose">Loan Purpose</Label>
                    <Select value={loanPurpose} onValueChange={setLoanPurpose}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose an option..." />
                      </SelectTrigger>
                      <SelectContent>
                        {LOAN_PURPOSES.map((purpose) => (
                          <SelectItem key={purpose} value={purpose}>
                            {purpose}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="loan-amount">Loan Amount *</Label>
                    <Input
                      id="loan-amount"
                      type="text"
                      placeholder="$0.00"
                      value={loanAmount}
                      onChange={(e) => setLoanAmount(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="borrower-name">Borrower Last Name</Label>
                    <Input
                      id="borrower-name"
                      placeholder="Type here..."
                      value={borrowerLastName}
                      onChange={(e) => setBorrowerLastName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="borrower-location">Subject Property State</Label>
                    <Select value={subjectPropertyState} onValueChange={setSubjectPropertyState}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose an option..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AL">Alabama</SelectItem>
                        <SelectItem value="AK">Alaska</SelectItem>
                        <SelectItem value="AZ">Arizona</SelectItem>
                        <SelectItem value="AR">Arkansas</SelectItem>
                        <SelectItem value="CA">California</SelectItem>
                        <SelectItem value="CO">Colorado</SelectItem>
                        <SelectItem value="CT">Connecticut</SelectItem>
                        <SelectItem value="DE">Delaware</SelectItem>
                        <SelectItem value="DC">District of Columbia</SelectItem>
                        <SelectItem value="FL">Florida</SelectItem>
                        <SelectItem value="GA">Georgia</SelectItem>
                        <SelectItem value="HI">Hawaii</SelectItem>
                        <SelectItem value="ID">Idaho</SelectItem>
                        <SelectItem value="IL">Illinois</SelectItem>
                        <SelectItem value="IN">Indiana</SelectItem>
                        <SelectItem value="IA">Iowa</SelectItem>
                        <SelectItem value="KS">Kansas</SelectItem>
                        <SelectItem value="KY">Kentucky</SelectItem>
                        <SelectItem value="LA">Louisiana</SelectItem>
                        <SelectItem value="ME">Maine</SelectItem>
                        <SelectItem value="MD">Maryland</SelectItem>
                        <SelectItem value="MA">Massachusetts</SelectItem>
                        <SelectItem value="MI">Michigan</SelectItem>
                        <SelectItem value="MN">Minnesota</SelectItem>
                        <SelectItem value="MS">Mississippi</SelectItem>
                        <SelectItem value="MO">Missouri</SelectItem>
                        <SelectItem value="MT">Montana</SelectItem>
                        <SelectItem value="NE">Nebraska</SelectItem>
                        <SelectItem value="NV">Nevada</SelectItem>
                        <SelectItem value="NH">New Hampshire</SelectItem>
                        <SelectItem value="NJ">New Jersey</SelectItem>
                        <SelectItem value="NM">New Mexico</SelectItem>
                        <SelectItem value="NY">New York</SelectItem>
                        <SelectItem value="NC">North Carolina</SelectItem>
                        <SelectItem value="ND">North Dakota</SelectItem>
                        <SelectItem value="OH">Ohio</SelectItem>
                        <SelectItem value="OK">Oklahoma</SelectItem>
                        <SelectItem value="OR">Oregon</SelectItem>
                        <SelectItem value="PA">Pennsylvania</SelectItem>
                        <SelectItem value="RI">Rhode Island</SelectItem>
                        <SelectItem value="SC">South Carolina</SelectItem>
                        <SelectItem value="SD">South Dakota</SelectItem>
                        <SelectItem value="TN">Tennessee</SelectItem>
                        <SelectItem value="TX">Texas</SelectItem>
                        <SelectItem value="UT">Utah</SelectItem>
                        <SelectItem value="VT">Vermont</SelectItem>
                        <SelectItem value="VA">Virginia</SelectItem>
                        <SelectItem value="WA">Washington</SelectItem>
                        <SelectItem value="WV">West Virginia</SelectItem>
                        <SelectItem value="WI">Wisconsin</SelectItem>
                        <SelectItem value="WY">Wyoming</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="submission-date">Submission Date</Label>
                    <Input
                      id="submission-date"
                      type="date"
                      value={submissionDate}
                      onChange={(e) => setSubmissionDate(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="closing-date">Closing Date</Label>
                    <Input
                      id="closing-date"
                      type="date"
                      value={closingDate}
                      onChange={(e) => setClosingDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lock-expiration-date">Rate Expiration Date</Label>
                  <Input
                    id="lock-expiration-date"
                    type="date"
                    value={lockExpirationDate}
                    onChange={(e) => setLockExpirationDate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-sm mb-2">Issue Details</h3>
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
