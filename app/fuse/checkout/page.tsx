import { createClient } from '@supabase/supabase-js'
import { FuseCheckout } from '@/components/fuse/FuseCheckout'

export const dynamic = 'force-dynamic'

export default async function FuseCheckoutPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: event } = await supabase
    .from('fuse_events')
    .select('id, name, year, start_date, end_date, location, registration_open')
    .eq('is_active', true)
    .single()

  if (!event) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#1a1008',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#a08860',
        fontFamily: 'Inter, sans-serif',
      }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, marginBottom: 8, color: '#c8a050' }}>
            No Active Event
          </h1>
          <p>Registration is not currently open. Check back soon!</p>
        </div>
      </div>
    )
  }

  if (event.registration_open === false) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#1a1008',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#a08860',
        fontFamily: 'Inter, sans-serif',
      }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, marginBottom: 8, color: '#c8a050' }}>
            Registration Coming Soon
          </h1>
          <p>Registration for {event.name} is not yet open. Check back soon!</p>
        </div>
      </div>
    )
  }

  // Fetch public prices (tier IS NULL) for this event
  const { data: prices } = await supabase
    .from('fuse_ticket_prices')
    .select('*')
    .eq('fuse_event_id', event.id)
    .is('tier', null)
    .eq('is_active', true)
    .order('sort_order')

  // Determine if early bird is active
  const now = new Date()
  const earlyBirdGA = prices?.find(
    (p) => p.product_key === 'ga' && p.pricing_phase === 'early_bird'
  )
  const regularGA = prices?.find(
    (p) => p.product_key === 'ga' && p.pricing_phase === 'regular'
  )

  let isEarlyBird = false
  if (earlyBirdGA) {
    const start = earlyBirdGA.phase_start_at ? new Date(earlyBirdGA.phase_start_at) : null
    const end = earlyBirdGA.phase_end_at ? new Date(earlyBirdGA.phase_end_at) : null
    // Early bird is active if: no dates set (always active until set), or current time is within range
    if (!start && !end) {
      isEarlyBird = true // No dates = early bird is active by default
    } else if (start && end) {
      isEarlyBird = now >= start && now <= end
    } else if (start && !end) {
      isEarlyBird = now >= start
    } else if (!start && end) {
      isEarlyBird = now <= end
    }
  }

  // Pick the active GA price
  const activeGA = isEarlyBird && earlyBirdGA ? earlyBirdGA : regularGA

  // Build the prices array for the component (active GA + addons)
  const publicPrices = [
    ...(activeGA ? [activeGA] : []),
    ...(prices?.filter((p) => p.is_addon) || []),
  ]

  return (
    <FuseCheckout
      event={event}
      prices={publicPrices}
      isEarlyBird={isEarlyBird}
    />
  )
}
