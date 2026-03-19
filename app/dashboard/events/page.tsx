import { createClient } from '@/lib/supabase/server'
import { getViewAsSettings, applyViewAsOverride } from '@/lib/view-as-server'
import { getNextOccurrence, toStartCase } from '@/lib/recurrence-utils'
import EventsClient from './events-client'

// Helper function to format event date and time in the event's timezone
function formatEventDateTime(startDate: string, timezone?: string): { date: string; time: string } {
  const eventDate = new Date(startDate)
  const tz = timezone || 'America/New_York'

  const dateOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: tz,
  }

  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
  }

  // Convert timezone to abbreviation
  const timezoneAbbr = tz.includes('New_York') ? 'ET'
    : tz.includes('Chicago') ? 'CT'
    : tz.includes('Denver') ? 'MT'
    : tz.includes('Los_Angeles') ? 'PT'
    : 'ET'

  const formattedDate = eventDate.toLocaleDateString('en-US', dateOptions)
  const formattedTime = `${eventDate.toLocaleTimeString('en-US', timeOptions)} ${timezoneAbbr}`

  return { date: formattedDate, time: formattedTime }
}

export default async function EventsPage() {
  const supabase = await createClient()

  // Get current user for access control
  const { data: { user } } = await supabase.auth.getUser()
  let { data: profile } = await supabase
    .from('profiles')
    .select('role, plan_tier, is_admin')
    .eq('id', user?.id)
    .single()

  // Apply view-as override if active
  const viewAsSettings = await getViewAsSettings()
  profile = applyViewAsOverride(profile, viewAsSettings)

  // Fetch content types for filter (only events types)
  const { data: contentTypes } = await supabase
    .from('content_types')
    .select('*')
    .eq('content_area', 'events')
    .eq('is_active', true)
    .order('name', { ascending: true })

  // Fetch upcoming events from database with type info
  // Note: Removed date filter to show all published events, not just future ones
  const { data: eventsData } = await supabase
    .from('events')
    .select(`
      id,
      title,
      event_type,
      start_date,
      timezone,
      thumbnail_url,
      required_plan_tier,
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
    .order('start_date', { ascending: false })

  // Filter events based on user access
  const filteredEvents = (eventsData || []).filter(event => {
    // Admins can see everything
    if (profile?.is_admin) {
      return true
    }

    // Check plan tier access
    // Map "Premium Guest" to "Premium" for access checks
    const effectiveTier = profile?.plan_tier === 'Premium Guest' ? 'Premium' : profile?.plan_tier

    const hasPlanAccess = !event.required_plan_tier ||
      event.required_plan_tier.length === 0 ||
      event.required_plan_tier.includes(effectiveTier)

    return hasPlanAccess
  })

  const events = filteredEvents
    .map(event => {
      // For recurring events, calculate next occurrence
      let displayDate = event.start_date
      if (event.is_recurring && event.recurrence_rule) {
        const nextOccurrence = getNextOccurrence(event.start_date, event.recurrence_rule, event.recurrence_end_date || undefined)
        if (nextOccurrence) {
          displayDate = nextOccurrence.toISOString()
        }
      }

      const { date, time } = formatEventDateTime(displayDate, event.timezone)
      // Prioritize type_id (content_types) over event_type enum
      const typeName = (event.type as any)?.name || event.event_type
      const typeColor = (event.type as any)?.color || '#6b7280'

      return {
        id: event.id,
        title: event.title,
        type: toStartCase(typeName),
        date,
        time,
        image: event.thumbnail_url || 'https://placehold.co/600x400/8b1554/white?text=' + encodeURIComponent(event.title),
        typeColor,
        isRecurring: event.is_recurring || false,
        recurrenceRule: event.recurrence_rule || '',
        sortDate: new Date(displayDate).getTime() // Add sort date for ordering
      }
    })
    .sort((a, b) => a.sortDate - b.sortDate) // Sort by upcoming dates (ascending)

  return <EventsClient events={events} contentTypes={contentTypes || []} />
}
