'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

interface FuseEvent {
  id: string
  name: string
  year: number
  location?: string
  start_date?: string
  end_date?: string
}

interface TierPrice {
  id: string
  product_key: string
  label: string
  description: string | null
  price: number
  stripe_price_id: string | null
  is_addon: boolean
  is_included: boolean
  gender_lock: string | null
  sort_order: number
}

interface FuseRegistrationFormProps {
  event: FuseEvent
  userProfile: {
    id: string
    email: string
    full_name?: string
    phone?: string
    company?: string
    plan_tier?: string
    gender?: string
  }
  hasExistingRegistration?: boolean
  isAdmin?: boolean
  tierPrices: TierPrice[]
}

const TIER_INCLUSIONS: Record<string, { ticket: string; label: string }> = {
  Premium: { ticket: 'general_admission', label: 'General Admission' },
  Elite: { ticket: 'general_admission', label: 'General Admission' },
  VIP: { ticket: 'vip', label: 'VIP' },
}

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]

const FUSE_ATTENDANCE_OPTIONS = [
  { value: '0', label: 'This will be my first Fuse' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5+', label: '5 or more' },
]

// Fuse-branded styles
const styles = {
  card: {
    background: '#e8d5b0',
    border: '1px solid #c4a872',
    borderRadius: '8px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.15), inset 0 0 60px rgba(160,120,60,0.15)',
  },
  header: {
    background: 'linear-gradient(135deg, #1a1008 0%, #2a1d12 50%, #1a1008 100%)',
    borderRadius: '8px 8px 0 0',
    borderBottom: '2px solid #c8943a44',
  },
  input: {
    width: '100%',
    background: '#f5e8cc',
    border: '1px solid #c4a872',
    borderRadius: '4px',
    padding: '10px 14px',
    color: '#2a1a08',
    fontSize: '14px',
    outline: 'none',
  },
  label: {
    display: 'block',
    fontSize: '10px',
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    color: '#6a5030',
    marginBottom: '6px',
    fontWeight: 700,
  },
  btnPrimary: {
    width: '100%',
    background: 'linear-gradient(135deg, #8a4a10, #a86018, #c87828)',
    color: '#f8e8c8',
    border: '2px solid #6a3a08',
    borderRadius: '5px',
    padding: '14px 24px',
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
  },
  ticketCard: (selected: boolean) => ({
    background: selected ? '#f8e4b4' : '#f5e8cc',
    border: `2px solid ${selected ? '#8a4a10' : '#c4a872'}`,
    borderRadius: '6px',
    padding: '16px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: selected ? '0 0 0 3px #8a4a1022' : 'none',
  }),
  addonCard: (selected: boolean, locked: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    background: selected ? '#f8e4b4' : '#f5e8cc',
    border: `2px solid ${selected ? '#8a4a10' : '#c4a872'}`,
    borderRadius: '6px',
    padding: '14px 16px',
    cursor: locked ? 'not-allowed' : 'pointer',
    opacity: locked ? 0.4 : 1,
    transition: 'all 0.2s',
  }),
}

export function FuseRegistrationForm({
  event,
  userProfile,
  hasExistingRegistration,
  isAdmin = false,
  tierPrices,
}: FuseRegistrationFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state
  const [firstName, setFirstName] = useState(userProfile.full_name?.split(' ')[0] || '')
  const [lastName, setLastName] = useState(userProfile.full_name?.split(' ').slice(1).join(' ') || '')
  const [preferredName, setPreferredName] = useState('')
  const [phone, setPhone] = useState(userProfile.phone || '')
  const [email, setEmail] = useState(userProfile.email || '')
  const [company, setCompany] = useState(userProfile.company || '')
  const [gender, setGender] = useState(userProfile.gender?.toLowerCase() || '')
  const [fuseAttendance, setFuseAttendance] = useState('')
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null)
  const [addonState, setAddonState] = useState<Record<string, boolean>>({})
  const [marketingConsent, setMarketingConsent] = useState(false)

  const tierInclusion = userProfile.plan_tier ? TIER_INCLUSIONS[userProfile.plan_tier] : null
  const effectiveTierInclusion = tierInclusion || (isAdmin ? { ticket: 'general_admission', label: 'General Admission (Admin Test)' } : null)
  const isClaimingIncludedTicket = !!effectiveTierInclusion

  // Split prices into tickets and addons
  const ticketPrices = tierPrices.filter((p) => !p.is_addon)
  const addonPrices = tierPrices.filter((p) => p.is_addon)

  // Format date range
  const formatDateRange = () => {
    if (!event.start_date) return null
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
      if (start.getMonth() === end.getMonth()) return `${m1} ${d1}-${d2}, ${y}`
      return `${m1} ${d1} - ${months[end.getMonth()]} ${d2}, ${y}`
    }
    return `${m1} ${d1}, ${y}`
  }

  // Calculate total
  const calculateTotal = () => {
    let total = 0
    // Included ticket = free
    if (!isClaimingIncludedTicket && selectedTicket) {
      const tp = ticketPrices.find((p) => p.id === selectedTicket)
      total += tp?.price || 0
    }
    // Add-ons
    addonPrices.forEach((addon) => {
      if (addonState[addon.product_key] && !addon.is_included) {
        total += addon.price
      }
    })
    return total
  }

  const toggleAddon = (productKey: string) => {
    const addon = addonPrices.find((a) => a.product_key === productKey)
    if (addon?.gender_lock && gender !== addon.gender_lock) return
    if (addon?.is_included) return // Can't toggle included items
    setAddonState((prev) => ({ ...prev, [productKey]: !prev[productKey] }))
  }

  const handleSubmit = async () => {
    // Validation
    if (!firstName.trim() || !lastName.trim()) { toast.error('Please enter your first and last name'); return }
    if (!phone.trim()) { toast.error('Please enter your mobile phone number'); return }
    if (!email.trim()) { toast.error('Please enter your email address'); return }
    if (!company.trim()) { toast.error('Please enter your company name'); return }
    if (!gender) { toast.error('Please select your gender'); return }
    if (!fuseAttendance) { toast.error('Please select how many Fuse events you have attended'); return }

    setIsSubmitting(true)

    try {
      const total = calculateTotal()
      let ticketType = effectiveTierInclusion?.ticket || 'general_admission'
      const hasHallOfAime = !!addonState.hoa || addonPrices.some((p) => p.product_key === 'hoa' && p.is_included)
      const hasWmnAtFuse = !!addonState.wmn

      // If there's a cost, redirect to Stripe
      if (total > 0) {
        // Build line items from selected add-ons that have stripe_price_ids
        const paidAddons = addonPrices.filter(
          (a) => addonState[a.product_key] && !a.is_included && a.price > 0 && a.stripe_price_id
        )

        // TODO: Create Stripe checkout for member add-on purchases
        toast.error('Paid add-on checkout coming soon')
        setIsSubmitting(false)
        return
      }

      // Free registration (claiming included ticket)
      const response = await fetch('/api/fuse-registration/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fuse_event_id: event.id,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          preferred_name: preferredName.trim() || null,
          phone: phone.trim(),
          email: email.trim(),
          company: company.trim(),
          gender,
          fuse_attendance: fuseAttendance,
          ticket_type: ticketType,
          has_hall_of_aime: hasHallOfAime,
          has_wmn_at_fuse: hasWmnAtFuse,
          marketing_consent: marketingConsent,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to register')
      }

      toast.success('Registration complete!')
      router.push('/dashboard/fuse-registration/confirmation')
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Failed to complete registration')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (hasExistingRegistration) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="rounded-xl overflow-hidden" style={{ background: '#1a1008' }}>
          <div className="p-8 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/fuse/fuse-logo.png" alt="" className="h-20 mx-auto mb-4" />
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: 'linear-gradient(135deg, #3a5a20, #4a7a2a)' }}>
              <CheckCircle2 className="h-7 w-7" style={{ color: '#e8f0d8' }} />
            </div>
            <h2 className="text-xl font-bold mb-2" style={{ color: '#e8d5b0' }}>
              You&apos;re Registered for {event.name}!
            </h2>
            <p style={{ color: '#a08860' }}>
              We can&apos;t wait to see you in {event.location}. Check your email for confirmation details.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const total = calculateTotal()
  const dateRange = formatDateRange()

  return (
    <div className="max-w-2xl mx-auto">
      {/* Fuse-branded header */}
      <div className="p-6 text-center" style={styles.header}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/fuse/fuse-logo.png" alt="Fuse Austin" className="h-28 mx-auto mb-2" />
        {dateRange && (
          <div className="text-lg font-semibold tracking-wider" style={{ color: '#c8a050' }}>
            {dateRange}
          </div>
        )}
        {event.location && (
          <div className="text-xs tracking-widest uppercase mt-1" style={{ color: '#8a7555' }}>
            {event.location}
          </div>
        )}
        {isClaimingIncludedTicket && (
          <div className="mt-3 rounded-lg px-4 py-2 text-sm inline-block"
            style={{ background: '#c8943a22', border: '1px solid #c8943a44', color: '#c8a050' }}>
            Your <strong style={{ color: '#e8d5b0' }}>{userProfile.plan_tier}</strong> membership includes a{' '}
            <strong style={{ color: '#e8d5b0' }}>{effectiveTierInclusion!.label}</strong> ticket
          </div>
        )}
      </div>

      {/* Parchment form card */}
      <div className="p-6 space-y-5" style={{ ...styles.card, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
        {/* Name */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label style={styles.label}>First Name <span style={{ color: '#b04020' }}>*</span></label>
            <input style={styles.input} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First Name" />
          </div>
          <div>
            <label style={styles.label}>Last Name <span style={{ color: '#b04020' }}>*</span></label>
            <input style={styles.input} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last Name" />
          </div>
        </div>

        {/* Preferred Name */}
        <div>
          <label style={styles.label}>Preferred Name <span style={{ color: '#8a7050', textTransform: 'none', letterSpacing: 0, fontWeight: 400, fontStyle: 'italic' }}>— What should we put on your badge?</span></label>
          <input style={styles.input} value={preferredName} onChange={(e) => setPreferredName(e.target.value)} placeholder="e.g. JJ" />
        </div>

        {/* Phone & Email */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label style={styles.label}>Mobile Phone <span style={{ color: '#b04020' }}>*</span></label>
            <input style={styles.input} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile Phone" />
          </div>
          <div>
            <label style={styles.label}>Email Address <span style={{ color: '#b04020' }}>*</span></label>
            <input style={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          </div>
        </div>

        {/* Company */}
        <div>
          <label style={styles.label}>Company Name <span style={{ color: '#b04020' }}>*</span></label>
          <input style={styles.input} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company Name" />
        </div>

        {/* Gender & Attendance */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label style={styles.label}>Gender <span style={{ color: '#b04020' }}>*</span></label>
            <select style={{ ...styles.input, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238a7050'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: '32px' }} value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Select...</option>
              {GENDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={styles.label}>Fuse Events Attended <span style={{ color: '#b04020' }}>*</span></label>
            <select style={{ ...styles.input, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238a7050'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: '32px' }} value={fuseAttendance} onChange={(e) => setFuseAttendance(e.target.value)}>
              <option value="">Select...</option>
              {FUSE_ATTENDANCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center justify-center gap-2 py-2" style={{ color: '#b8943a' }}>
          <div style={{ width: 60, height: 1, background: 'linear-gradient(90deg, transparent, #b8943a, transparent)' }} />
          <span style={{ fontSize: 10 }}>&#10022;</span>
          <div style={{ width: 60, height: 1, background: 'linear-gradient(90deg, transparent, #b8943a, transparent)' }} />
        </div>

        {/* Ticket selection */}
        <div>
          <label style={{ ...styles.label, marginBottom: 12 }}>Your Ticket</label>

          {/* Included ticket card */}
          {isClaimingIncludedTicket && (
            <div style={styles.ticketCard(true)}>
              <div className="flex items-center justify-between">
                <div>
                  <div style={{ fontWeight: 700, color: '#3a2a10', fontSize: 14 }}>{effectiveTierInclusion!.label}</div>
                  <div style={{ fontSize: 11, color: '#8a7050', marginTop: 2 }}>Included with your {userProfile.plan_tier} membership</div>
                </div>
                <span style={{ fontWeight: 700, color: '#3a5a20', fontSize: 15 }}>Included</span>
              </div>
            </div>
          )}

          {/* VIP members also see their VIP Guest ticket */}
          {ticketPrices.filter((p) => p.product_key === 'vip_guest' && p.is_included).map((p) => (
            <div key={p.id} style={{ ...styles.ticketCard(true), marginTop: 10 }}>
              <div className="flex items-center justify-between">
                <div>
                  <div style={{ fontWeight: 700, color: '#3a2a10', fontSize: 14 }}>{p.label}</div>
                  <div style={{ fontSize: 11, color: '#8a7050', marginTop: 2 }}>{p.description}</div>
                </div>
                <span style={{ fontWeight: 700, color: '#3a5a20', fontSize: 15 }}>Included</span>
              </div>
            </div>
          ))}
        </div>

        {/* Add-ons from DB */}
        {addonPrices.length > 0 && (
          <div>
            <label style={{ ...styles.label, marginBottom: 12 }}>Add-Ons</label>
            <div className="space-y-2">
              {addonPrices.map((addon) => {
                const isLocked = !!(addon.gender_lock && gender !== addon.gender_lock)
                const isSelected = addon.is_included || !!addonState[addon.product_key]
                return (
                  <div
                    key={addon.id}
                    style={styles.addonCard(isSelected, isLocked)}
                    onClick={() => !addon.is_included && toggleAddon(addon.product_key)}
                  >
                    <div style={{ flexShrink: 0 }}>
                      {isSelected ? (
                        <div style={{ width: 20, height: 20, background: 'linear-gradient(135deg, #8a4a10, #a86018)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>&#10003;</div>
                      ) : (
                        <div style={{ width: 20, height: 20, border: '2px solid #c4a872', borderRadius: 4, background: '#f5e8cc' }} />
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#3a2a10', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {addon.label}
                        {addon.gender_lock === 'female' && (
                          <span style={{ fontSize: 9, letterSpacing: '0.1em', color: '#8a3870', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #8a387066', padding: '2px 5px', borderRadius: 3 }}>Women Only</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: '#8a7050', lineHeight: 1.4 }}>{addon.description}</div>
                    </div>
                    <div style={{ flexShrink: 0, fontSize: 15, fontWeight: 700, color: '#3a2a10' }}>
                      {addon.is_included ? (
                        <span style={{ color: '#3a5a20' }}>Included</span>
                      ) : addon.price === 0 ? 'FREE' : `$${addon.price}`}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Marketing Consent */}
        <label className="flex items-start gap-3 text-sm cursor-pointer" style={{ color: '#6a5030' }}>
          <input
            type="checkbox"
            checked={marketingConsent}
            onChange={(e) => setMarketingConsent(e.target.checked)}
            className="mt-1"
            style={{ accentColor: '#8a4a10' }}
          />
          <span>
            By checking this box, I consent to receive marketing and promotional messages,
            including special offers, discounts, new product updates among others. Message
            frequency may vary. Message & Data rates may apply. Reply <strong>HELP</strong>{' '}
            for help or <strong>STOP</strong> to opt-out.
          </span>
        </label>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          style={{
            ...styles.btnPrimary,
            opacity: isSubmitting ? 0.6 : 1,
          }}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Processing...
            </span>
          ) : total === 0 ? (
            'CLAIM TICKET &#9733;'
          ) : (
            `PURCHASE - $${total} &#9733;`
          )}
        </button>
      </div>
    </div>
  )
}
