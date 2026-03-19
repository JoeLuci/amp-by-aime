import { cookies } from 'next/headers'
import { ImpersonationSettings, IMPERSONATION_COOKIE_NAME } from './impersonation'

const MAX_AGE = 60 * 60 * 4 // 4 hours

/**
 * Get current impersonation settings from cookie (server-side)
 */
export async function getImpersonationSettings(): Promise<ImpersonationSettings | null> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(IMPERSONATION_COOKIE_NAME)

  if (!cookie) return null

  try {
    const settings = JSON.parse(cookie.value)
    if (settings.isImpersonating) {
      return settings
    }
    return null
  } catch {
    return null
  }
}

/**
 * Set impersonation settings cookie (server-side)
 */
export async function setImpersonationSettings(settings: ImpersonationSettings) {
  const cookieStore = await cookies()
  cookieStore.set(IMPERSONATION_COOKIE_NAME, JSON.stringify(settings), {
    httpOnly: false, // Need client access for banner display
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/'
  })
}

/**
 * Clear impersonation settings cookie (server-side)
 */
export async function clearImpersonationSettings() {
  const cookieStore = await cookies()
  cookieStore.delete(IMPERSONATION_COOKIE_NAME)
}

/**
 * Get the effective user ID for data fetching
 * Returns impersonated user ID if impersonating, otherwise the auth user ID
 */
export async function getEffectiveUserId(authUserId: string): Promise<string> {
  const settings = await getImpersonationSettings()
  if (settings?.isImpersonating && settings.impersonatedUserId) {
    return settings.impersonatedUserId
  }
  return authUserId
}
