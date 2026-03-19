'use client'

import './fuse-checkout.css'

interface FuseCheckoutSuccessProps {
  registration: {
    email: string
    full_name: string
    ticket_type: string
    has_hall_of_aime: boolean
    has_wmn_at_fuse: boolean
  }
  event: {
    name: string
    year: number
    start_date: string
    end_date: string
    location: string
  }
}

const TICKET_PRICES: Record<string, number> = {
  general_admission: 499,
  general_admission_plus: 699,
}

const TICKET_LABELS: Record<string, string> = {
  general_admission: 'General Admission',
  general_admission_plus: 'General Admission Plus',
  vip: 'VIP',
}

export function FuseCheckoutSuccess({ registration, event }: FuseCheckoutSuccessProps) {
  const ticketPrice = TICKET_PRICES[registration.ticket_type] || 0
  let total = ticketPrice
  if (registration.has_hall_of_aime) total += 349

  const formatDates = () => {
    if (!event.start_date) return ''
    const start = new Date(event.start_date + 'T00:00:00')
    const end = event.end_date ? new Date(event.end_date + 'T00:00:00') : null
    const months = [
      'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
      'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
    ]
    const m1 = months[start.getMonth()]
    const d1 = start.getDate()
    const y = start.getFullYear()
    if (end) {
      const d2 = end.getDate()
      if (start.getMonth() === end.getMonth()) {
        return `${m1} ${d1}-${d2}, ${y}`
      }
      return `${m1} ${d1} - ${months[end.getMonth()]} ${d2}, ${y}`
    }
    return `${m1} ${d1}, ${y}`
  }

  return (
    <div className="fuse-page">
      {/* Header */}
      <div className="fuse-header">
        <div className="fuse-skyline-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/fuse/austin-skyline.jpg" alt="" className="fuse-skyline-img" />
        </div>
        <div className="fuse-header-content">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/fuse/fuse-logo.png" alt="Fuse Austin" className="fuse-logo-img" />
          <div className="fuse-event-date">{formatDates()}</div>
          <div className="fuse-event-venue">{event.location}</div>
        </div>
      </div>

      {/* Progress (all done) */}
      <div className="fuse-progress">
        <div className="fuse-progress-step">
          <div className="fuse-progress-dot done">&#10003;</div>
          <span className="fuse-progress-label">Your Info</span>
          <div className="fuse-progress-line done" />
        </div>
        <div className="fuse-progress-step">
          <div className="fuse-progress-dot done">&#10003;</div>
          <span className="fuse-progress-label">Tickets</span>
          <div className="fuse-progress-line done" />
        </div>
        <div className="fuse-progress-step">
          <div className="fuse-progress-dot active">3</div>
          <span className="fuse-progress-label active">Review</span>
        </div>
      </div>

      {/* Success card */}
      <div className="fuse-container">
        <div className="fuse-step">
          <div className="fuse-success-wrap">
            <div className="fuse-success-parchment">
              <div className="fuse-success-longhorn">
                <svg width="64" height="32" viewBox="0 0 64 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M32 28C32 28 28 20 20 16C12 12 2 14 0 16C2 12 12 4 24 8C28 9.5 30 12 32 16C34 12 36 9.5 40 8C52 4 62 12 64 16C62 14 52 12 44 16C36 20 32 28 32 28Z" fill="currentColor"/>
                </svg>
              </div>
              <div className="fuse-success-icon">&#10003;</div>
              <div className="fuse-success-title">You&apos;re Registered!</div>
              <div className="fuse-success-text">A confirmation has been sent to</div>
              <div className="fuse-success-email">{registration.email}</div>
              <div className="fuse-success-divider" />
              <div className="fuse-success-sub">
                We&apos;ll see you in {event.location} at {event.name}.
              </div>
              <div className="fuse-success-divider" />
              <div className="fuse-success-amount-label">Order Total:</div>
              <div className="fuse-success-amount">${total.toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
