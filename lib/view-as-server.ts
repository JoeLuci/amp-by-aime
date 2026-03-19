import { cookies } from 'next/headers'

export interface ViewAsSettings {
  role: string
  plan_tier: string
  isViewingAs: boolean
  specificUserId?: string
  specificUserName?: string
}

export async function getViewAsSettings(): Promise<ViewAsSettings | null> {
  const cookieStore = await cookies()
  const viewAsCookie = cookieStore.get('viewAsSettings')

  if (!viewAsCookie) return null

  try {
    return JSON.parse(viewAsCookie.value)
  } catch {
    return null
  }
}

export async function setViewAsSettings(settings: ViewAsSettings) {
  const cookieStore = await cookies()
  cookieStore.set('viewAsSettings', JSON.stringify(settings), {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 // 24 hours
  })
}

export async function clearViewAsSettings() {
  const cookieStore = await cookies()
  cookieStore.delete('viewAsSettings')
}

export function applyViewAsOverride(profile: any, viewAsSettings: ViewAsSettings | null) {
  if (!viewAsSettings || !viewAsSettings.isViewingAs) {
    return profile
  }

  // Override the profile with view-as settings
  // Important: Set is_admin to false so access control works correctly
  return {
    ...profile,
    role: viewAsSettings.role,
    plan_tier: viewAsSettings.plan_tier,
    is_admin: false, // Critical: Treat admin as regular user during preview
    _isViewingAs: true,
    _originalIsAdmin: profile?.is_admin
  }
}
