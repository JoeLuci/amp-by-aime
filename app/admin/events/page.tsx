import { createClient } from '@/lib/supabase/server'
import { EventsTable } from '@/components/admin/EventsTable'

export default async function EventsPage() {
  const supabase = await createClient()

  // Fetch all data in parallel for better performance
  const [
    { data: events, error },
    { data: contentTypes, error: typesError },
    { data: tags, error: tagsError }
  ] = await Promise.all([
    supabase
      .from('events')
      .select(`
        *,
        creator:created_by (
          full_name
        )
      `)
      .order('start_date', { ascending: false }),
    supabase
      .from('content_types')
      .select('*')
      .eq('content_area', 'events')
      .eq('is_active', true)
      .order('name', { ascending: true }),
    supabase
      .from('tags')
      .select('*')
      .order('name', { ascending: true })
  ])

  // Transform to include creator_name
  const transformedEvents = events?.map(e => ({
    ...e,
    creator_name: e.creator?.full_name || 'Unknown'
  })) || []

  if (error) console.error('Error fetching events:', error)
  if (typesError) console.error('Error fetching content types:', typesError)
  if (tagsError) console.error('Error fetching tags:', tagsError)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Events</h1>
        <p className="text-gray-600">Manage webinars, conferences, training sessions, and networking events</p>
      </div>

      <EventsTable
        events={transformedEvents}
        contentTypes={contentTypes || []}
        tags={tags || []}
      />
    </div>
  )
}
