'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle2, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

// ===== Types =====

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

interface FuseClaimPageProps {
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
  existingRegistration: {
    id: string
    ticket_type: string
    has_hall_of_aime: boolean
    has_wmn_at_fuse: boolean
  } | null
  isAdmin: boolean
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

const TICKET_LABELS: Record<string, string> = {
  general_admission: 'General Admission',
  vip: 'VIP',
}

// ===== Component =====

export function FuseClaimPage({
  event,
  userProfile,
  existingRegistration,
  isAdmin,
  tierPrices,
}: FuseClaimPageProps) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
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
  const [addonState, setAddonState] = useState<Record<string, boolean>>({})
  const [guests, setGuests] = useState<{ id: number; firstName: string; lastName: string; email: string }[]>([])
  const [nextGuestId, setNextGuestId] = useState(0)
  const [marketingConsent, setMarketingConsent] = useState(false)

  const tierInclusion = userProfile.plan_tier ? TIER_INCLUSIONS[userProfile.plan_tier] : null
  const effectiveTierInclusion = tierInclusion || (isAdmin ? { ticket: 'general_admission', label: 'General Admission (Admin Test)' } : null)

  const addonPrices = tierPrices.filter((p) => p.is_addon)
  const GUEST_PRICE = 399 // TODO: pull from fuse_ticket_prices when guest product is added

  const formatDateRange = () => {
    if (!event.start_date) return null
    const start = new Date(event.start_date + 'T00:00:00')
    const end = event.end_date ? new Date(event.end_date + 'T00:00:00') : null
    const months = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER']
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

  const calculateTotal = () => {
    let total = 0
    addonPrices.forEach((addon) => {
      if (addonState[addon.product_key] && !addon.is_included && addon.price > 0) {
        total += addon.price
      }
    })
    total += guests.length * GUEST_PRICE
    return total
  }

  const addGuest = () => {
    const id = nextGuestId + 1
    setNextGuestId(id)
    setGuests([...guests, { id, firstName: '', lastName: '', email: '' }])
  }

  const removeGuest = (gid: number) => {
    setGuests(guests.filter((g) => g.id !== gid))
  }

  const updateGuest = (gid: number, field: 'firstName' | 'lastName' | 'email', value: string) => {
    setGuests(guests.map((g) => (g.id === gid ? { ...g, [field]: value } : g)))
  }

  const toggleAddon = (productKey: string) => {
    const addon = addonPrices.find((a) => a.product_key === productKey)
    if (addon?.gender_lock && gender !== addon.gender_lock) return
    if (addon?.is_included) return
    setAddonState((prev) => ({ ...prev, [productKey]: !prev[productKey] }))
  }

  const handleSubmit = async () => {
    if (!firstName.trim() || !lastName.trim()) { toast.error('Please enter your first and last name'); return }
    if (!phone.trim()) { toast.error('Please enter your mobile phone number'); return }
    if (!email.trim()) { toast.error('Please enter your email address'); return }
    if (!company.trim()) { toast.error('Please enter your company name'); return }
    if (!gender) { toast.error('Please select your gender'); return }
    if (!fuseAttendance) { toast.error('Please select how many Fuse events you have attended'); return }

    setIsSubmitting(true)

    try {
      const total = calculateTotal()
      const ticketType = effectiveTierInclusion?.ticket || 'general_admission'
      const hasHallOfAime = !!addonState.hoa || addonPrices.some((p) => p.product_key === 'hoa' && p.is_included)
      const hasWmnAtFuse = !!addonState.wmn

      // Submit claim — API handles Stripe redirect if there are paid add-ons
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
          guests: guests.map((g) => ({
            full_name: `${g.firstName.trim()} ${g.lastName.trim()}`,
            email: g.email.trim().toLowerCase(),
            ticket_type: 'general_admission',
            is_included: false,
          })),
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to register')

      // If Stripe checkout needed for paid add-ons, redirect
      if (data.checkout_url) {
        window.location.href = data.checkout_url
        return
      }

      toast.success('Registration complete!')
      setModalOpen(false)
      router.push('/dashboard/fuse-registration/confirmation')
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Failed to complete registration')
    } finally {
      setIsSubmitting(false)
    }
  }

  const dateRange = formatDateRange()
  const total = calculateTotal()

  // Input styles
  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#f5e8cc', border: '1px solid #c4a872',
    borderRadius: 4, padding: '8px 12px', color: '#2a1a08', fontSize: 13, outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
    color: '#6a5030', marginBottom: 6, fontWeight: 700,
  }
  const selectStyle: React.CSSProperties = {
    ...inputStyle, appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238a7050'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 32,
  }

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        {/* Landing card */}
        <div className="rounded-xl overflow-hidden" style={{ background: '#1a1008', border: '1px solid #3a281844' }}>
          {/* Header with logo */}
          <div className="p-8 text-center" style={{ borderBottom: '1px solid #c8943a33' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/fuse/fuse-logo.png" alt="Fuse Austin" className="h-32 mx-auto mb-3" />
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
          </div>

          {/* Ticket info */}
          <div className="p-6">
            {existingRegistration ? (
              /* Already registered */
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ background: 'linear-gradient(135deg, #3a5a20, #4a7a2a)' }}>
                  <CheckCircle2 className="h-7 w-7" style={{ color: '#e8f0d8' }} />
                </div>
                <h2 className="text-xl font-bold mb-2" style={{ color: '#e8d5b0' }}>
                  You&apos;re Registered!
                </h2>
                <p className="text-sm mb-1" style={{ color: '#a08860' }}>
                  {TICKET_LABELS[existingRegistration.ticket_type] || existingRegistration.ticket_type} ticket claimed
                </p>
                <p style={{ color: '#6a5030', fontSize: 13 }}>
                  We&apos;ll see you at {event.name} in Austin, TX.
                </p>
              </div>
            ) : (
              /* Claim prompt */
              <div className="text-center py-4">
                {effectiveTierInclusion && (
                  <div className="mb-4 rounded-lg px-4 py-2 text-sm inline-block"
                    style={{ background: '#c8943a22', border: '1px solid #c8943a44', color: '#c8a050' }}>
                    Your <strong style={{ color: '#e8d5b0' }}>{userProfile.plan_tier}</strong> membership includes a{' '}
                    <strong style={{ color: '#e8d5b0' }}>{effectiveTierInclusion.label}</strong> ticket
                  </div>
                )}

                {/* Available add-ons preview */}
                {addonPrices.length > 0 && (
                  <div className="mb-5 space-y-1">
                    {addonPrices.map((addon) => (
                      <div key={addon.id} className="text-sm" style={{ color: '#8a7555' }}>
                        {addon.label}: {addon.is_included ? (
                          <span style={{ color: '#4a7a2a' }}>Included</span>
                        ) : addon.price === 0 ? (
                          <span style={{ color: '#c8a050' }}>FREE</span>
                        ) : (
                          <span style={{ color: '#c8a050' }}>${addon.price}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setModalOpen(true)}
                  className="px-8 py-3 font-semibold text-sm rounded-lg transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #8a4a10, #a86018, #c87828)',
                    color: '#f8e8c8',
                    border: '2px solid #6a3a08',
                    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.15)')}
                  onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
                >
                  Claim Your Ticket &#9733;
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== CLAIM MODAL ===== */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(10,6,3,0.85)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false) }}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg"
            style={{
              background: '#e8d5b0',
              border: '1px solid #c4a872',
              boxShadow: '0 8px 48px rgba(0,0,0,0.6), inset 0 0 60px rgba(160,120,60,0.15)',
            }}
          >
            {/* Modal header */}
            <div className="relative px-4 py-3 flex items-center justify-between" style={{
              background: 'linear-gradient(135deg, #1a1008 0%, #2a1d12 50%, #1a1008 100%)',
              borderBottom: '2px solid #c8943a44',
              borderRadius: '8px 8px 0 0',
            }}>
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/fuse/fuse-logo.png" alt="" className="h-10" />
                <div className="text-sm font-semibold tracking-wider" style={{ color: '#c8a050' }}>
                  Claim Your {effectiveTierInclusion?.label} Ticket
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-2xl leading-none"
                style={{ color: '#6a5030', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            {/* Modal form */}
            <div className="p-5 space-y-3" style={{ color: '#3a2a18' }}>

              {/* Name */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label style={labelStyle}>First Name <span style={{ color: '#b04020' }}>*</span></label>
                  <input style={inputStyle} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
                </div>
                <div>
                  <label style={labelStyle}>Last Name <span style={{ color: '#b04020' }}>*</span></label>
                  <input style={inputStyle} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
                </div>
              </div>

              {/* Preferred Name */}
              <div>
                <label style={labelStyle}>Preferred Name <span style={{ color: '#8a7050', textTransform: 'none', letterSpacing: 0, fontWeight: 400, fontStyle: 'italic' }}>— Badge name</span></label>
                <input style={inputStyle} value={preferredName} onChange={(e) => setPreferredName(e.target.value)} placeholder="e.g. JJ" />
              </div>

              {/* Phone & Email */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label style={labelStyle}>Mobile Phone <span style={{ color: '#b04020' }}>*</span></label>
                  <input style={inputStyle} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" />
                </div>
                <div>
                  <label style={labelStyle}>Email Address <span style={{ color: '#b04020' }}>*</span></label>
                  <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
                </div>
              </div>

              {/* Company */}
              <div>
                <label style={labelStyle}>Company Name <span style={{ color: '#b04020' }}>*</span></label>
                <input style={inputStyle} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company name" />
              </div>

              {/* Gender & Attendance */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label style={labelStyle}>Gender <span style={{ color: '#b04020' }}>*</span></label>
                  <select style={selectStyle} value={gender} onChange={(e) => setGender(e.target.value)}>
                    <option value="">Select...</option>
                    {GENDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Fuse Events Attended <span style={{ color: '#b04020' }}>*</span></label>
                  <select style={selectStyle} value={fuseAttendance} onChange={(e) => setFuseAttendance(e.target.value)}>
                    <option value="">Select...</option>
                    {FUSE_ATTENDANCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Divider */}
              <div style={{ borderTop: '2px solid #d4b880', paddingTop: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6a5030', marginBottom: 8 }}>
                  Your Ticket
                </div>

                {/* Included ticket */}
                <div style={{
                  background: '#f8e4b4', border: '2px solid #8a4a10', borderRadius: 6,
                  padding: 16, boxShadow: '0 0 0 3px #8a4a1022',
                }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div style={{ fontWeight: 700, color: '#3a2a10', fontSize: 14 }}>
                        {effectiveTierInclusion?.label}
                      </div>
                      <div style={{ fontSize: 11, color: '#8a7050', marginTop: 2 }}>
                        Included with {userProfile.plan_tier} membership
                      </div>
                    </div>
                    <span style={{ fontWeight: 700, color: '#3a5a20', fontSize: 15 }}>Included</span>
                  </div>
                </div>

                {/* VIP Guest if applicable */}
                {tierPrices.filter((p) => p.product_key === 'vip_guest' && p.is_included).map((p) => (
                  <div key={p.id} style={{
                    background: '#f8e4b4', border: '2px solid #8a4a10', borderRadius: 6,
                    padding: 16, marginTop: 10, boxShadow: '0 0 0 3px #8a4a1022',
                  }}>
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

              {/* Bring a Guest */}
              <div style={{ borderTop: '2px solid #d4b880', paddingTop: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6a5030', marginBottom: 4 }}>
                  Bring a Guest
                </div>
                <div style={{ fontSize: 12, color: '#8a7050', marginBottom: 12 }}>
                  Guest tickets are ${GUEST_PRICE} each
                </div>

                {guests.map((g, idx) => (
                  <div key={g.id} style={{
                    background: '#f0ddb8', border: '1px solid #c4a872', borderRadius: 6,
                    padding: 16, marginBottom: 10,
                    boxShadow: 'inset 0 1px 4px rgba(100,60,20,0.06)',
                  }}>
                    <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6a5030' }}>
                        Guest {idx + 1}
                      </span>
                      <div className="flex items-center gap-3">
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#5a3a10' }}>${GUEST_PRICE}</span>
                        <button
                          type="button"
                          onClick={() => removeGuest(g.id)}
                          style={{ background: 'none', border: 'none', color: '#a06040', cursor: 'pointer', fontSize: 18, fontWeight: 700, lineHeight: 1, padding: '0 4px' }}
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3" style={{ marginBottom: 8 }}>
                      <div>
                        <label style={labelStyle}>First Name <span style={{ color: '#b04020' }}>*</span></label>
                        <input style={inputStyle} value={g.firstName} onChange={(e) => updateGuest(g.id, 'firstName', e.target.value)} placeholder="First name" />
                      </div>
                      <div>
                        <label style={labelStyle}>Last Name <span style={{ color: '#b04020' }}>*</span></label>
                        <input style={inputStyle} value={g.lastName} onChange={(e) => updateGuest(g.id, 'lastName', e.target.value)} placeholder="Last name" />
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Email Address <span style={{ color: '#b04020' }}>*</span></label>
                      <input style={inputStyle} type="email" value={g.email} onChange={(e) => updateGuest(g.id, 'email', e.target.value)} placeholder="guest@email.com" />
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addGuest}
                  className="flex items-center justify-center gap-2 w-full"
                  style={{
                    background: '#f5e8cc', border: '2px dashed #c4a872', borderRadius: 6,
                    padding: 14, color: '#8a6a30', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#a07030'; e.currentTarget.style.background = '#f0e0bc' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#c4a872'; e.currentTarget.style.background = '#f5e8cc' }}
                >
                  <span style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>+</span>
                  <span>Add a Guest</span>
                </button>

                {guests.length > 0 && (
                  <div style={{ fontSize: 11, color: '#8a7050', textAlign: 'center', marginTop: 4 }}>
                    {guests.length} guest{guests.length > 1 ? 's' : ''} added — ${(guests.length * GUEST_PRICE).toLocaleString()}
                  </div>
                )}
              </div>

              {/* Add-ons */}
              {addonPrices.length > 0 && (
                <div style={{ borderTop: '2px solid #d4b880', paddingTop: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6a5030', marginBottom: 4 }}>
                    Add-Ons
                  </div>
                  <div style={{ fontSize: 12, color: '#8a7050', marginBottom: 12 }}>Enhance your Fuse experience</div>

                  <div className="space-y-2">
                    {addonPrices.map((addon) => {
                      const isLocked = !!(addon.gender_lock && gender !== addon.gender_lock)
                      const isSelected = addon.is_included || !!addonState[addon.product_key]
                      return (
                        <div
                          key={addon.id}
                          className="flex items-center gap-3"
                          style={{
                            background: isSelected ? '#f8e4b4' : '#f5e8cc',
                            border: `2px solid ${isSelected ? '#8a4a10' : '#c4a872'}`,
                            borderRadius: 6, padding: '14px 16px',
                            cursor: addon.is_included ? 'default' : isLocked ? 'not-allowed' : 'pointer',
                            opacity: isLocked ? 0.4 : 1, transition: 'all 0.2s',
                          }}
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
                            {addon.is_included ? <span style={{ color: '#3a5a20' }}>Included</span> : addon.price === 0 ? 'FREE' : `$${addon.price}`}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Marketing Consent */}
              <label className="flex items-start gap-3 text-sm cursor-pointer" style={{ color: '#6a5030' }}>
                <input type="checkbox" checked={marketingConsent} onChange={(e) => setMarketingConsent(e.target.checked)} className="mt-1" style={{ accentColor: '#8a4a10' }} />
                <span>
                  I consent to receive marketing and promotional messages. Message frequency may vary. Reply <strong>HELP</strong> for help or <strong>STOP</strong> to opt-out.
                </span>
              </label>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  background: total > 0
                    ? 'linear-gradient(135deg, #8a4a10, #a86018, #c87828)'
                    : 'linear-gradient(135deg, #3a5a20, #4a7a2a, #5a8a3a)',
                  color: total > 0 ? '#f8e8c8' : '#e8f0d8',
                  border: `2px solid ${total > 0 ? '#6a3a08' : '#2a4018'}`,
                  borderRadius: 5, padding: '14px 24px', fontSize: 13, fontWeight: 700,
                  letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
                  textShadow: '0 1px 2px rgba(0,0,0,0.3)', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  opacity: isSubmitting ? 0.6 : 1,
                }}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Processing...
                  </span>
                ) : total === 0 ? (
                  'Claim Ticket ✦'
                ) : (
                  `Complete & Pay $${total} ✦`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
