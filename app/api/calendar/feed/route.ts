import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()

    // Fetch all published upcoming events
    const { data: events } = await supabase
      .from('events')
      .select('*')
      .eq('is_published', true)
      .gte('start_date', new Date().toISOString())
      .order('start_date', { ascending: true })

    if (!events || events.length === 0) {
      return new NextResponse('No events available', { status: 404 })
    }

    // Format date for iCal (YYYYMMDDTHHMMSSZ)
    const formatICSDate = (dateString: string) => {
      const date = new Date(dateString)
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    }

    // Generate VEVENT entries for each event
    const vevents = events.map(event => {
      const start = formatICSDate(event.start_date)
      const end = event.end_date
        ? formatICSDate(event.end_date)
        : formatICSDate(new Date(new Date(event.start_date).getTime() + 2 * 60 * 60 * 1000).toISOString())

      // Clean description
      const cleanDescription = (event.description || '')
        .replace(/<[^>]*>/g, '')
        .replace(/\n/g, '\\n')
        .substring(0, 500)

      const veventLines = [
        'BEGIN:VEVENT',
        `UID:${event.id}@aime.app`,
        `DTSTAMP:${formatICSDate(new Date().toISOString())}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${event.title}`,
        event.location ? `LOCATION:${event.location}` : '',
        cleanDescription ? `DESCRIPTION:${cleanDescription}` : '',
        event.registration_url || event.meeting_url ? `URL:${event.registration_url || event.meeting_url}` : '',
        'STATUS:CONFIRMED'
      ]

      // Add recurrence rule if event is recurring
      if (event.is_recurring && event.recurrence_rule) {
        veventLines.push(`RRULE:${event.recurrence_rule}`)

        // Add recurrence end date if specified
        if (event.recurrence_end_date) {
          const untilDate = formatICSDate(event.recurrence_end_date)
          veventLines.push(`RRULE:${event.recurrence_rule};UNTIL=${untilDate}`)
          // Remove the previous RRULE line since we're combining them
          veventLines.splice(veventLines.length - 2, 1)
        }
      }

      veventLines.push('END:VEVENT')

      return veventLines.filter(line => line).join('\r\n')
    }).join('\r\n')

    // Generate full iCalendar feed
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//AIME//Events Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:AIME Events',
      'X-WR-TIMEZONE:America/New_York',
      'X-WR-CALDESC:Stay up to date with AIME events',
      vevents,
      'END:VCALENDAR'
    ].join('\r\n')

    // Return as downloadable .ics file
    return new NextResponse(icsContent, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="aime-events.ics"',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    })
  } catch (error) {
    console.error('Error generating calendar feed:', error)
    return new NextResponse('Error generating calendar feed', { status: 500 })
  }
}
