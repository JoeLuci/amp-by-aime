import { createClient } from '@/lib/supabase/server'
import { FuseRegistrationManager } from '@/components/admin/FuseRegistrationManager'

export default async function FuseRegistrationPage() {
  const supabase = await createClient()

  // Fetch fuse events
  const { data: events, error: eventsError } = await supabase
    .from('fuse_events')
    .select('*')
    .order('year', { ascending: false })

  if (eventsError) {
    console.error('Error fetching fuse events:', eventsError)
  }

  // Get the active event (or first event if none active)
  const activeEvent = events?.find(e => e.is_active) || events?.[0]
  const activeEventId = activeEvent?.id

  // Fetch initial registrations for the active event
  let registrations: any[] = []
  let pagination = { page: 1, limit: 10, total: 0, totalPages: 0 }

  if (activeEventId) {
    const { data, error, count } = await supabase
      .from('fuse_registrations')
      .select(`
        *,
        fuse_event:fuse_event_id (id, name, year),
        user:user_id (id, email, full_name),
        guests:fuse_registration_guests (*)
      `, { count: 'exact' })
      .eq('fuse_event_id', activeEventId)
      .order('created_at', { ascending: false })
      .range(0, 9)

    if (error) {
      console.error('Error fetching registrations:', error)
    } else {
      registrations = data || []
      pagination = {
        page: 1,
        limit: 20,
        total: count || 0,
        totalPages: count ? Math.ceil(count / 10) : 0,
      }
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Fuse Registration</h1>
        <p className="text-gray-600">
          Manage member ticket claims and public ticket purchases for Fuse events
        </p>
      </div>

      <FuseRegistrationManager
        events={events || []}
        initialRegistrations={registrations}
        initialPagination={pagination}
      />
    </div>
  )
}
