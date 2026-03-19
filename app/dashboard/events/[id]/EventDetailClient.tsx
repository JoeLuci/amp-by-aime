'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar, ChevronDown } from 'lucide-react'

interface EventDetailClientProps {
  eventId: string
  eventName: string
  eventUrl?: string
  startDate?: string
  endDate?: string
  location?: string
  description?: string
  isRecurring?: boolean
  recurrenceRule?: string
  recurrenceEndDate?: string
}

export function EventDetailClient({
  eventId,
  eventName,
  eventUrl,
  startDate,
  endDate,
  location,
  description,
  isRecurring,
  recurrenceRule,
  recurrenceEndDate
}: EventDetailClientProps) {
  const [showCalendarMenu, setShowCalendarMenu] = useState(false)

  const handleMoreInfo = () => {
    if (eventUrl) {
      window.open(eventUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const handleGoogleCalendar = () => {
    if (!startDate) return

    const start = new Date(startDate).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    const end = endDate
      ? new Date(endDate).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
      : new Date(new Date(startDate).getTime() + 2 * 60 * 60 * 1000).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

    const details = (description || '').replace(/<[^>]*>/g, '').substring(0, 500)

    let recurrence = ''
    if (isRecurring && recurrenceRule) {
      // Convert RRULE to Google Calendar format
      recurrence = `&recur=RRULE:${recurrenceRule}`
      if (recurrenceEndDate) {
        const until = new Date(recurrenceEndDate).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
        recurrence += `;UNTIL=${until}`
      }
    }

    const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(eventName)}&dates=${start}/${end}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location || '')}${recurrence}`
    window.open(googleUrl, '_blank', 'noopener,noreferrer')
    setShowCalendarMenu(false)
  }

  const handleOutlookCalendar = () => {
    if (!startDate) return

    const start = new Date(startDate).toISOString()
    const end = endDate
      ? new Date(endDate).toISOString()
      : new Date(new Date(startDate).getTime() + 2 * 60 * 60 * 1000).toISOString()

    const details = (description || '').replace(/<[^>]*>/g, '').substring(0, 500)

    const outlookUrl = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(eventName)}&startdt=${start}&enddt=${end}&body=${encodeURIComponent(details)}&location=${encodeURIComponent(location || '')}`
    window.open(outlookUrl, '_blank', 'noopener,noreferrer')
    setShowCalendarMenu(false)
  }

  const downloadICS = () => {
    if (!startDate) return

    const formatICSDate = (dateString: string) => {
      const date = new Date(dateString)
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    }

    const start = formatICSDate(startDate)
    const end = endDate ? formatICSDate(endDate) : formatICSDate(new Date(new Date(startDate).getTime() + 2 * 60 * 60 * 1000).toISOString())

    const cleanDescription = (description || '')
      .replace(/<[^>]*>/g, '')
      .replace(/\n/g, '\\n')
      .substring(0, 500)

    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//AIME//Events//EN',
      'BEGIN:VEVENT',
      `UID:${eventId}@aime.app`,
      `DTSTAMP:${formatICSDate(new Date().toISOString())}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${eventName}`,
      location ? `LOCATION:${location}` : '',
      cleanDescription ? `DESCRIPTION:${cleanDescription}` : '',
      eventUrl ? `URL:${eventUrl}` : '',
      'STATUS:CONFIRMED'
    ]

    // Add recurrence rule if event is recurring
    if (isRecurring && recurrenceRule) {
      if (recurrenceEndDate) {
        const untilDate = formatICSDate(recurrenceEndDate)
        icsLines.push(`RRULE:${recurrenceRule};UNTIL=${untilDate}`)
      } else {
        icsLines.push(`RRULE:${recurrenceRule}`)
      }
    }

    icsLines.push('END:VEVENT')
    icsLines.push('END:VCALENDAR')

    const icsContent = icsLines.filter(line => line).join('\r\n')

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${eventName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.ics`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(link.href)
    setShowCalendarMenu(false)
  }

  return (
    <div className="flex gap-2">
      {startDate && (
        <div className="relative">
          <Button
            onClick={() => setShowCalendarMenu(!showCalendarMenu)}
            className="bg-[#25314e] hover:bg-[#1a233a] text-white font-semibold rounded-full px-6 whitespace-nowrap"
          >
            <Calendar className="w-4 h-4 mr-2" />
            Add to Calendar
            <ChevronDown className="w-4 h-4 ml-2" />
          </Button>

          {showCalendarMenu && (
            <div className="absolute top-full mt-2 right-0 bg-white rounded-lg shadow-xl border border-gray-200 py-2 min-w-[200px] z-50">
              <button
                onClick={handleGoogleCalendar}
                className="w-full px-4 py-2 text-left hover:bg-gray-100 text-sm text-gray-700"
              >
                Google Calendar
              </button>
              <button
                onClick={handleOutlookCalendar}
                className="w-full px-4 py-2 text-left hover:bg-gray-100 text-sm text-gray-700"
              >
                Outlook Calendar
              </button>
              <button
                onClick={downloadICS}
                className="w-full px-4 py-2 text-left hover:bg-gray-100 text-sm text-gray-700"
              >
                Apple Calendar / Other
              </button>
            </div>
          )}

          {showCalendarMenu && (
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowCalendarMenu(false)}
            />
          )}
        </div>
      )}
      <Button
        onClick={handleMoreInfo}
        disabled={!eventUrl}
        className="bg-[#dd1969] hover:bg-[#c01559] text-white font-semibold rounded-full px-6 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
      >
        More Info
      </Button>
    </div>
  )
}
