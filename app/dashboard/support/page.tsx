'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

interface Ticket {
  id: string
  type: string
  status: string
  created_at: string
  partner_name?: string
  lender_name?: string
  vendor_name?: string
  loan_number?: string
  issue_type?: string
}

const STATUS_COLORS: Record<string, string> = {
  received: 'bg-blue-100 text-blue-800',
  pending: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-purple-100 text-purple-800',
  closed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
}

const STATUS_LABELS: Record<string, string> = {
  received: 'Received',
  pending: 'Pending',
  in_progress: 'In Progress',
  closed: 'Closed',
  failed: 'Failed',
}

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)

  // Form state
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetchTickets()
  }, [])

  const fetchTickets = async (loadMore = false) => {
    if (loadMore) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setOffset(0)
    }

    const supabase = createClient()

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const currentOffset = loadMore ? offset : 0
      const ITEMS_PER_PAGE = 20

      // Fetch all submission types
      const [changeAE, lenderConn, vendorConn, loanEsc, supportTickets] = await Promise.all([
        supabase
          .from('change_ae_requests')
          .select('id, user_status, created_at, lender_name, issue_type')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .range(currentOffset, currentOffset + 49),

        supabase
          .from('lender_connections')
          .select('id, user_status, created_at, lender_name')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .range(currentOffset, currentOffset + 49),

        supabase
          .from('vendor_connections')
          .select('id, user_status, created_at, vendor_name')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .range(currentOffset, currentOffset + 49),

        supabase
          .from('loan_escalations')
          .select('id, user_status, created_at, loan_number, issue_type')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .range(currentOffset, currentOffset + 49),

        supabase
          .from('support_tickets')
          .select('id, user_status, created_at, subject, category')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .range(currentOffset, currentOffset + 49),
      ])

      // Combine and format all tickets
      const newTickets: Ticket[] = [
        ...(changeAE.data || []).map(t => ({
          id: t.id,
          type: 'Change AE',
          status: t.user_status || 'pending',
          created_at: t.created_at,
          lender_name: t.lender_name,
          issue_type: t.issue_type,
        })),
        ...(lenderConn.data || []).map(t => ({
          id: t.id,
          type: 'Lender Connection',
          status: t.user_status || 'pending',
          created_at: t.created_at,
          lender_name: t.lender_name,
        })),
        ...(vendorConn.data || []).map(t => ({
          id: t.id,
          type: 'Vendor Connection',
          status: t.user_status || 'pending',
          created_at: t.created_at,
          vendor_name: t.vendor_name,
        })),
        ...(loanEsc.data || []).map(t => ({
          id: t.id,
          type: 'Loan Escalation',
          status: t.user_status || 'pending',
          created_at: t.created_at,
          loan_number: t.loan_number,
          issue_type: t.issue_type,
        })),
        ...(supportTickets.data || []).map(t => ({
          id: t.id,
          type: 'Support Ticket',
          status: t.user_status || 'pending',
          created_at: t.created_at,
          partner_name: `${t.subject} (${t.category})`,
        })),
      ]

      // Sort by created_at descending
      newTickets.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )

      if (loadMore) {
        setTickets(prev => [...prev, ...newTickets.slice(0, ITEMS_PER_PAGE)])
      } else {
        setTickets(newTickets.slice(0, ITEMS_PER_PAGE))
      }

      // Check if there are more items
      setHasMore(newTickets.length >= ITEMS_PER_PAGE)
      setOffset(currentOffset + ITEMS_PER_PAGE)
    } catch (error) {
      console.error('Error fetching tickets:', error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const loadMoreTickets = () => {
    fetchTickets(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!subject || !message) {
      toast.error('Please fill in all required fields')
      return
    }

    setSubmitting(true)

    try {
      const supabase = createClient()

      // Get session token for Authorization header
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('Not authenticated')
      }

      // Call Supabase Edge Function
      const edgeFunctionUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/support-ticket`
        : '/api/opportunities/support-ticket' // Fallback

      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          subject,
          message,
          category: category || 'Other',
          priority: 'normal', // Default to normal
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit ticket')
      }

      toast.success('Support ticket submitted successfully!')

      // Reset form
      setSubject('')
      setCategory('')
      setMessage('')

      // Refresh tickets
      fetchTickets()
    } catch (error) {
      console.error('Error submitting ticket:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to submit ticket')
    } finally {
      setSubmitting(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <div className="min-h-screen">
      {/* Page Header */}
      <div className="px-4 md:px-8 py-6 md:py-8">
        <h1 className="text-3xl md:text-4xl font-bold text-[#dd1969] mb-2">
          SUPPORT
        </h1>
        <p className="text-gray-600 text-sm md:text-base">
          We're here to help - submit a support ticket
        </p>
      </div>

      {/* Support Content */}
      <div className="px-4 md:px-8 pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Support Form */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Submit a Ticket</h2>
            <div className="bg-white rounded-lg shadow-md p-6 md:p-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <Label htmlFor="subject">Subject</Label>
                  <Input
                    id="subject"
                    type="text"
                    placeholder="Brief description of your issue"
                    className="mt-2"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="category">Category</Label>
                  <select
                    id="category"
                    className="mt-2 w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#dd1969]"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="">Select a category</option>
                    <option value="Technical Issue">Technical Issue</option>
                    <option value="Account Question">Account Question</option>
                    <option value="Billing">Billing</option>
                    <option value="Feature Request">Feature Request</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    placeholder="Please describe your issue in detail..."
                    rows={6}
                    className="mt-2"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-[#dd1969] hover:bg-[#c01559] text-white font-semibold h-12"
                  disabled={submitting}
                >
                  {submitting ? 'Submitting...' : 'Submit Ticket'}
                </Button>
              </form>
            </div>
          </div>

          {/* Recent Tickets */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Tickets</h2>
            <div className="bg-white rounded-lg shadow-md p-6">
              {loading ? (
                <p className="text-gray-500 text-center py-4">Loading...</p>
              ) : tickets.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No recent tickets</p>
              ) : (
                <div className="space-y-4">
                  {tickets.map((ticket) => (
                    <div
                      key={`${ticket.type}-${ticket.id}`}
                      className="border-b pb-4 last:border-b-0 last:pb-0"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm text-gray-900">
                              {ticket.type}
                            </span>
                            <Badge
                              variant="secondary"
                              className={`${STATUS_COLORS[ticket.status]} text-xs`}
                            >
                              {STATUS_LABELS[ticket.status]}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-600 truncate">
                            {ticket.lender_name && `Lender: ${ticket.lender_name}`}
                            {ticket.vendor_name && `Vendor: ${ticket.vendor_name}`}
                            {ticket.loan_number && `Loan #${ticket.loan_number}`}
                            {ticket.partner_name && ticket.partner_name}
                            {ticket.issue_type && ` - ${ticket.issue_type}`}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {formatDate(ticket.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}

                  {hasMore && (
                    <div className="mt-4 text-center">
                      <Button
                        onClick={loadMoreTickets}
                        disabled={loadingMore}
                        variant="outline"
                        className="w-full"
                      >
                        {loadingMore ? 'Loading...' : 'Load More'}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
