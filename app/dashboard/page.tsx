import { DashboardClient } from './DashboardClient'
import { EventsCalendar } from '@/components/dashboard/EventsCalendar'
import { FeaturedCarousel } from '@/components/dashboard/FeaturedCarousel'
import { createClient } from '@/lib/supabase/server'
import { generateOccurrences, toStartCase } from '@/lib/recurrence-utils'
import { getViewAsSettings, applyViewAsOverride } from '@/lib/view-as-server'

// Revalidate every 60 seconds for fresh content
export const revalidate = 60

// Helper function to format event time
function formatEventTime(startDate: string, timezone?: string): string {
  const eventDate = new Date(startDate)
  const tz = timezone || 'America/New_York'
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz
  }

  // Convert timezone to abbreviation
  const timezoneAbbr = tz.includes('New_York') ? 'Eastern'
    : tz.includes('Chicago') ? 'Central'
    : tz.includes('Denver') ? 'Mountain'
    : tz.includes('Los_Angeles') ? 'Pacific'
    : 'ET'

  return `${eventDate.toLocaleTimeString('en-US', timeOptions)} ${timezoneAbbr}`
}

export default async function DashboardPage() {
  const supabase = await createClient()

  // Get current user profile for plan tier
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch profile and view-as settings in parallel, along with events and featured items
  const [
    { data: profileData },
    viewAsSettings,
    { data: eventsData },
    { data: featuredVendors },
    { data: featuredLenders }
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('plan_tier, role, escalations_remaining')
      .eq('id', user?.id)
      .single(),
    getViewAsSettings(),
    supabase
      .from('events')
      .select(`
        id,
        title,
        event_type,
        start_date,
        timezone,
        is_recurring,
        recurrence_rule,
        recurrence_end_date,
        type:type_id (
          id,
          name,
          slug,
          color
        )
      `)
      .eq('is_published', true)
      .order('start_date', { ascending: true }),
    supabase
      .from('vendors')
      .select('id, name, logo_url, slug')
      .eq('is_active', true)
      .eq('is_featured', true)
      .order('display_order', { ascending: true })
      .limit(6),
    supabase
      .from('lenders')
      .select('id, name, logo_url, slug')
      .eq('is_active', true)
      .eq('is_featured', true)
      .order('display_order', { ascending: true })
      .limit(6)
  ])

  // Apply view-as override if active
  const profile = applyViewAsOverride(profileData, viewAsSettings)

  // Define date range for calendar (today to 6 months from now)
  const rangeStart = new Date()
  const rangeEnd = new Date()
  rangeEnd.setMonth(rangeEnd.getMonth() + 6)

  // Process events and expand recurring events into multiple occurrences
  const expandedEvents: any[] = []

  for (const event of eventsData || []) {
    // Prioritize type_id (content_types) over event_type enum
    const typeName = (event.type as any)?.name || event.event_type
    const typeColor = (event.type as any)?.color || '#6b7280'

    if (event.is_recurring && event.recurrence_rule) {
      // Generate all occurrences within the date range
      const occurrences = generateOccurrences(
        event.start_date,
        event.recurrence_rule,
        event.recurrence_end_date || undefined,
        rangeStart,
        rangeEnd
      )

      // Create a separate event entry for each occurrence
      for (const occurrence of occurrences) {
        expandedEvents.push({
          id: `${event.id}_${occurrence.getTime()}`, // Unique ID for each occurrence
          title: event.title,
          type: toStartCase(typeName),
          date: occurrence.toISOString(),
          time: formatEventTime(occurrence.toISOString(), event.timezone),
          typeColor,
          sortDate: occurrence.getTime()
        })
      }
    } else {
      // For non-recurring events, only show if in the future and within range
      const eventDate = new Date(event.start_date)
      if (eventDate >= rangeStart && eventDate <= rangeEnd) {
        expandedEvents.push({
          id: event.id,
          title: event.title,
          type: toStartCase(typeName),
          date: event.start_date,
          time: formatEventTime(event.start_date, event.timezone),
          typeColor,
          sortDate: eventDate.getTime()
        })
      }
    }
  }

  // Sort by date and limit
  const events = expandedEvents
    .sort((a, b) => a.sortDate - b.sortDate)
    .slice(0, 100) // Show up to 100 event instances

  // Combine featured items, prioritizing vendors
  const featuredItems = [
    ...(featuredVendors || []).map(v => ({
      id: v.id,
      title: v.name,
      logo: v.logo_url,
      slug: v.slug,
      type: 'vendor' as const
    })),
    ...(featuredLenders || []).map(l => ({
      id: l.id,
      title: l.name,
      logo: l.logo_url,
      slug: l.slug,
      type: 'lender' as const
    }))
  ].slice(0, 6)

  // Check if user is a partner (vendor or lender)
  const isPartner = profile?.role === 'partner_vendor' || profile?.role === 'partner_lender'

  return (
    <div className="min-h-screen">
      <DashboardClient planTier={profile?.plan_tier} userRole={profile?.role} escalationsRemaining={profile?.escalations_remaining} />

      {/* Featured Section */}
      <div className="px-4 md:px-8 py-6">
        <FeaturedCarousel items={featuredItems} />
      </div>

      {/* Upcoming Events & Live Stream - Hidden for partners */}
      {!isPartner && (
        <div className="px-4 md:px-8 py-6 pb-8">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">
            Upcoming Events & Live Stream
          </h2>
          <div className="bg-white rounded-lg border border-gray-200 p-4 md:p-6">
            <EventsCalendar events={events} />
          </div>
        </div>
      )}
    </div>
  )
}
