// Shared types and client-side utilities for impersonation
// Server-side utilities are in impersonation-server.ts

export interface ImpersonationSettings {
  impersonatedUserId: string
  impersonatedUserName: string
  impersonatedUserEmail: string
  adminUserId: string
  adminUserName: string
  startedAt: string
  isImpersonating: boolean
}

export const IMPERSONATION_COOKIE_NAME = 'impersonationSettings'

/**
 * Client-side helper to get impersonation settings from cookie
 */
export function getImpersonationSettingsClient(): ImpersonationSettings | null {
  if (typeof window === 'undefined') return null

  const cookie = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${IMPERSONATION_COOKIE_NAME}=`))

  if (!cookie) return null

  try {
    const settings = JSON.parse(decodeURIComponent(cookie.split('=')[1]))
    if (settings.isImpersonating) {
      return settings
    }
    return null
  } catch {
    return null
  }
}
