import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Calendar, MapPin, Ticket, Users, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getImpersonationSettings } from '@/lib/impersonation-server'
import { getViewAsSettings } from '@/lib/view-as-server'

export default async function FuseRegistrationConfirmationPage() {
  const supabase = await createClient()

  // Get authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/sign-in')
  }

  // Check for impersonation mode
  const impersonationSettings = await getImpersonationSettings()
  const isImpersonating = impersonationSettings?.isImpersonating && impersonationSettings?.impersonatedUserId
  const effectiveUserId = isImpersonating ? impersonationSettings.impersonatedUserId : user.id

  // Only allow access for admins in preview mode (View As / Impersonation)
  const viewAsSettings = await getViewAsSettings()
  const isAdminPreview = !!(isImpersonating || viewAsSettings?.isViewingAs)

  if (!isAdminPreview) {
    const { data: adminCheck } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!adminCheck?.is_admin) {
      redirect('/dashboard')
    }
  }

  // Get active Fuse event
  const { data: activeEvent } = await supabase
    .from('fuse_events')
    .select('*')
    .eq('is_active', true)
    .single()

  if (!activeEvent) {
    redirect('/dashboard')
  }

  // Get user's registration
  const { data: registration } = await supabase
    .from('fuse_registrations')
    .select(`
      *,
      guests:fuse_registration_guests (*)
    `)
    .eq('fuse_event_id', activeEvent.id)
    .eq('user_id', effectiveUserId)
    .single()

  if (!registration) {
    redirect('/dashboard/fuse-registration')
  }

  // Format date range
  const formatDateRange = () => {
    if (!activeEvent.start_date) return null
    const start = new Date(activeEvent.start_date)
    const end = activeEvent.end_date ? new Date(activeEvent.end_date) : null

    const options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' }
    if (end) {
      return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', { ...options, year: 'numeric' })}`
    }
    return start.toLocaleDateString('en-US', { ...options, year: 'numeric' })
  }

  const TICKET_LABELS: Record<string, string> = {
    general_admission: 'General Admission',
    vip: 'VIP',
    vip_guest: 'VIP Guest',
  }

  const dateRange = formatDateRange()

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        {/* Success Card */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#8b1554] to-[#dd1969] p-6 text-center text-white">
            <CheckCircle2 className="h-16 w-16 mx-auto mb-4" />
            <h1 className="text-2xl md:text-3xl font-bold mb-2">You're Registered!</h1>
            <p className="text-white/90">
              We can't wait to see you at {activeEvent.name}
            </p>
          </div>

          {/* Event Details */}
          <div className="p-6 border-b">
            <h2 className="font-semibold text-gray-900 mb-4">Event Details</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-gray-600">
                <Calendar className="h-5 w-5 text-[#8b1554]" />
                <span>{dateRange || 'Dates TBA'}</span>
              </div>
              {activeEvent.location && (
                <div className="flex items-center gap-3 text-gray-600">
                  <MapPin className="h-5 w-5 text-[#8b1554]" />
                  <span>{activeEvent.location}</span>
                </div>
              )}
            </div>
          </div>

          {/* Registration Details */}
          <div className="p-6 border-b">
            <h2 className="font-semibold text-gray-900 mb-4">Your Registration</h2>
            <div className="space-y-4">
              {/* Main ticket */}
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <Ticket className="h-5 w-5 text-[#8b1554]" />
                  <div>
                    <p className="font-medium">{TICKET_LABELS[registration.ticket_type]} Ticket</p>
                    <p className="text-sm text-gray-500">{registration.full_name}</p>
                  </div>
                </div>
                <span className="text-green-600 font-medium">Claimed</span>
              </div>

              {/* Guests */}
              {registration.guests && registration.guests.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-gray-700">
                    <Users className="h-4 w-4" />
                    <span className="font-medium text-sm">Guests</span>
                  </div>
                  {registration.guests.map((guest: any) => (
                    <div
                      key={guest.id}
                      className="flex items-center justify-between bg-gray-50 rounded-lg p-3 ml-6"
                    >
                      <div>
                        <p className="font-medium text-sm">{guest.full_name}</p>
                        <p className="text-xs text-gray-500">
                          {TICKET_LABELS[guest.ticket_type] || guest.ticket_type}
                        </p>
                      </div>
                      {guest.is_included && (
                        <span className="text-green-600 text-sm">Included</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add-ons */}
              {(registration.has_hall_of_aime || registration.has_wmn_at_fuse) && (
                <div className="border-t pt-4">
                  <p className="font-medium text-sm text-gray-700 mb-2">Add-ons</p>
                  <div className="space-y-2">
                    {registration.has_hall_of_aime && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span>Hall of Aime</span>
                      </div>
                    )}
                    {registration.has_wmn_at_fuse && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span>WMN at Fuse</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Next Steps */}
          <div className="p-6 bg-gray-50">
            <h2 className="font-semibold text-gray-900 mb-2">What's Next?</h2>
            <p className="text-sm text-gray-600 mb-4">
              You'll receive a confirmation email shortly with all the details. Keep an eye on your inbox for updates about the event schedule, sessions, and more!
            </p>
            <Button asChild className="w-full bg-[#dd1969] hover:bg-[#c01559]">
              <Link href="/dashboard">Return to Dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
