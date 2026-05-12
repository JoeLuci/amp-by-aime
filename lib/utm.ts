// Last-touch UTM / referral capture, persisted to localStorage so the value
// survives across pages and a 90-day window. Read at sign-up submit time and
// forwarded to GHL + stored on profiles.attribution.

const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const

const STORAGE_KEY = 'amp_attribution_v1'
const TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 days

export interface AttributionData {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
  landing_path: string
  referrer: string | null
  captured_at: string
}

interface StoredAttribution {
  data: AttributionData
  expires_at: number
}

/**
 * Capture UTM params from window.location and persist them.
 * Last-touch: only writes if the URL contains at least one utm_* param.
 * URLs without UTMs do not overwrite a previous capture.
 */
export function captureUtmIfPresent(): void {
  if (typeof window === 'undefined') return

  const params = new URLSearchParams(window.location.search)
  const captured: Partial<AttributionData> = {}
  let foundAny = false

  for (const key of UTM_KEYS) {
    const value = params.get(key)
    if (value) {
      captured[key] = value
      foundAny = true
    }
  }

  if (!foundAny) return

  const data: AttributionData = {
    ...captured,
    landing_path: window.location.pathname + window.location.search,
    referrer: document.referrer || null,
    captured_at: new Date().toISOString(),
  }

  try {
    const stored: StoredAttribution = { data, expires_at: Date.now() + TTL_MS }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // localStorage may be unavailable (private mode, quota); attribution is
    // best-effort, fail silently rather than blocking sign-up.
  }
}

export function getStoredAttribution(): AttributionData | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredAttribution
    if (parsed.expires_at && Date.now() > parsed.expires_at) {
      window.localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed.data
  } catch {
    return null
  }
}
