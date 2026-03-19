'use client'

import React, { useState } from 'react'
import { Calendar } from '@/components/ui/calendar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react'

interface Event {
  id: string
  title: string
  type: string
  date: string
  time: string
  typeColor: string
}

interface EventsCalendarProps {
  events: Event[]
}

export function EventsCalendar({ events }: EventsCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())
  const [showCalendarMenu, setShowCalendarMenu] = useState(false)

  // Parse event dates and create a map for quick lookup
  const eventsByDate = events.reduce((acc, event) => {
    try {
      const eventDate = parseISO(event.date)
      const dateKey = format(eventDate, 'yyyy-MM-dd')

      if (!acc[dateKey]) {
        acc[dateKey] = []
      }
      acc[dateKey].push(event)
    } catch (error) {
      console.error('Error parsing event date:', event.date, error)
    }
    return acc
  }, {} as Record<string, Event[]>)

  // Get events that have dates (for highlighting on calendar)
  const eventDates = Object.keys(eventsByDate).map(dateStr => parseISO(dateStr))

  // Get events for selected date
  const selectedDateEvents = selectedDate
    ? eventsByDate[format(selectedDate, 'yyyy-MM-dd')] || []
    : []

  // Create modifiers for each event date with its color
  const modifiersStyles: Record<string, React.CSSProperties> = {}
  const modifiers: Record<string, Date[]> = {}

  // Group events by date and assign colors
  Object.keys(eventsByDate).forEach((dateStr) => {
    const eventsOnDate = eventsByDate[dateStr]
    const date = parseISO(dateStr)

    // Use the color of the first event if only one event, otherwise use default pink
    const color = eventsOnDate.length === 1 ? eventsOnDate[0].typeColor : '#dd1969'

    const modifierKey = `event_${dateStr}`
    modifiers[modifierKey] = [date]
    // Use CSS custom property to pass color to button, style the button not the cell
    modifiersStyles[modifierKey] = {
      '--event-color': color
    } as React.CSSProperties
  })

  const handleSubscribeCalendar = (type: 'webcal' | 'google') => {
    const feedUrl = `${window.location.origin}/api/calendar/feed`

    if (type === 'webcal') {
      // For Apple Calendar, Outlook, and other calendar apps
      const webcalUrl = feedUrl.replace(/^https?:/, 'webcal:')
      window.location.href = webcalUrl
    } else if (type === 'google') {
      // For Google Calendar
      const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedUrl)}`
      window.open(googleUrl, '_blank', 'noopener,noreferrer')
    }

    setShowCalendarMenu(false)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Calendar */}
      <div>
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          modifiers={modifiers}
          modifiersStyles={modifiersStyles}
          showOutsideDays={true}
          fixedWeeks={true}
          className="rounded-md border w-full"
        />
      </div>

      {/* Events List for Selected Date */}
      <div>
        <h3 className="text-lg font-bold text-gray-900 mb-4">
          {selectedDate ? format(selectedDate, 'MMMM d, yyyy') : 'Select a date'}
        </h3>

        {selectedDateEvents.length > 0 ? (
          <div className="space-y-3">
            {selectedDateEvents.map((event) => {
              // Extract base event ID (handle recurring event composite IDs like "uuid_timestamp")
              const baseEventId = event.id.includes('_') ? event.id.split('_')[0] : event.id

              return (
                <Link
                  key={event.id}
                  href={`/dashboard/events/${baseEventId}`}
                  className="block"
                >
                <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-semibold text-gray-900 text-sm">
                      {event.title}
                    </h4>
                    <Badge
                      className="text-white text-xs border-0"
                      style={{ backgroundColor: event.typeColor, color: 'white' }}
                    >
                      {event.type}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-600">{event.time}</p>
                </div>
              </Link>
            )
            })}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-6 text-center">
            <p className="text-gray-500 text-sm">
              No events scheduled for this date
            </p>
          </div>
        )}

        {/* View All Events Link */}
        <Link
          href="/dashboard/events"
          className="block mt-4 text-center text-sm font-semibold text-[#dd1969] hover:underline"
        >
          View All Events →
        </Link>

        {/* Subscribe to Calendar */}
        <div className="mt-4 relative">
          <Button
            onClick={() => setShowCalendarMenu(!showCalendarMenu)}
            className="w-full bg-[#25314e] hover:bg-[#1a233a] text-white text-sm rounded-full"
          >
            <CalendarIcon className="w-4 h-4 mr-2" />
            Subscribe to Calendar
            <ChevronDown className="w-4 h-4 ml-2" />
          </Button>

          {showCalendarMenu && (
            <>
              <div className="absolute top-full mt-2 left-0 right-0 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50">
                <button
                  onClick={() => handleSubscribeCalendar('google')}
                  className="w-full px-4 py-2 text-left hover:bg-gray-100 text-sm text-gray-700"
                >
                  Google Calendar
                </button>
                <button
                  onClick={() => handleSubscribeCalendar('webcal')}
                  className="w-full px-4 py-2 text-left hover:bg-gray-100 text-sm text-gray-700"
                >
                  Apple / Outlook / Other
                </button>
              </div>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowCalendarMenu(false)}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
