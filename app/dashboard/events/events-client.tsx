'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import Image from 'next/image'
import { Repeat } from 'lucide-react'
import { formatRecurrenceRule, toStartCase } from '@/lib/recurrence-utils'
import { getImageUrl } from '@/lib/utils/image'

interface Event {
  id: string
  title: string
  type: string
  date: string
  time: string
  image: string
  typeColor: string
  isRecurring: boolean
  recurrenceRule: string
  sortDate: number
}

interface ContentType {
  id: string
  name: string
  slug: string
  color: string
}

interface EventsClientProps {
  events: Event[]
  contentTypes: ContentType[]
}

export default function EventsClient({ events, contentTypes }: EventsClientProps) {
  const searchParams = useSearchParams()
  const router = useRouter()

  // Initialize from URL param
  const typeParam = searchParams.get('type') || ''
  const [selectedType, setSelectedType] = useState<string>(typeParam)

  // Sync state when URL changes (e.g., browser back/forward)
  useEffect(() => {
    const urlType = searchParams.get('type') || ''
    // Match by slug (URL param) to name (display value)
    const matchedType = contentTypes.find(t => t.slug === urlType)
    setSelectedType(matchedType?.name || urlType)
  }, [searchParams, contentTypes])

  // Filter events by type
  const filteredEvents = selectedType
    ? events.filter(event => event.type.toLowerCase() === selectedType.toLowerCase())
    : events

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value
    setSelectedType(newType)

    // Update URL with slug
    const matchedType = contentTypes.find(t => t.name === newType)
    const slug = matchedType?.slug || newType.toLowerCase().replace(/\s+/g, '-')

    if (newType) {
      router.push(`/dashboard/events?type=${encodeURIComponent(slug)}`, { scroll: false })
    } else {
      router.push('/dashboard/events', { scroll: false })
    }
  }

  return (
    <div className="min-h-screen">
      {/* Page Header */}
      <div className="px-4 md:px-8 py-6 md:py-8">
        <h1 className="text-3xl md:text-4xl font-bold text-[#dd1969] mb-2">
          EVENTS
        </h1>
        <p className="text-gray-600 text-sm md:text-base">
          Join the industry's most cutting-edge Local, Regional, and National events
        </p>

        {/* Filter Bar */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mt-6">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">Filter:</span>
            <select
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#dd1969]"
              value={selectedType}
              onChange={handleTypeChange}
            >
              <option value="">All Types</option>
              {contentTypes.map((type) => (
                <option key={type.id} value={type.name}>
                  {toStartCase(type.name)}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm text-gray-600">
            Showing <span className="font-semibold">{filteredEvents.length}</span> events
          </p>
        </div>
      </div>

      {/* Events Section */}
      <div className="px-4 md:px-8 pb-8">

        {filteredEvents.length === 0 ? (
          /* No Data State */
          <div className="text-center py-20">
            <p className="text-gray-600 text-lg">
              {selectedType ? `No ${selectedType} events available` : 'No events available'}
            </p>
          </div>
        ) : (
          /* Events Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEvents.map((event) => (
              <div
                key={event.id}
                className="bg-white rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-shadow"
              >
                {/* Event Image */}
                <Link href={`/dashboard/events/${event.id}`}>
                  <div className="relative aspect-video bg-gray-200 cursor-pointer">
                    <Image
                      src={getImageUrl(event.image, 'card')}
                      alt={event.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      loading="lazy"
                    />
                    {/* Badges */}
                    <div className="absolute top-3 left-3 flex gap-2">
                      <Badge
                        className="text-white border-0"
                        style={{ backgroundColor: event.typeColor, color: 'white' }}
                      >
                        {event.type}
                      </Badge>
                      {event.isRecurring && (
                        <Badge className="bg-[#25314e] text-white flex items-center gap-1">
                          <Repeat className="w-3 h-3" />
                          Recurring
                        </Badge>
                      )}
                    </div>
                  </div>
                </Link>

                {/* Event Details */}
                <div className="p-4">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    {event.title}
                  </h3>
                  <p className="text-sm text-gray-600 mb-1">
                    {event.date} | {event.time}
                  </p>
                  {/* Fixed height container for recurrence text to maintain button alignment */}
                  <div className="h-6 mb-2">
                    {event.isRecurring && event.recurrenceRule && (
                      <p className="text-xs text-[#dd1969] font-medium">
                        {formatRecurrenceRule(event.recurrenceRule)}
                      </p>
                    )}
                  </div>
                  <Link href={`/dashboard/events/${event.id}`}>
                    <Button className="w-full bg-[#dd1969] hover:bg-[#c01559] text-white font-semibold rounded-full mt-2">
                      Learn More
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
