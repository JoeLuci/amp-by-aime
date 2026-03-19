export interface ViewAsSettings {
  role: string
  plan_tier: string
  isViewingAs: boolean
  specificUserId?: string
}

export function getViewAsSettings(): ViewAsSettings | null {
  if (typeof window === 'undefined') return null

  const settings = localStorage.getItem('viewAsSettings')
  if (!settings) return null

  try {
    return JSON.parse(settings)
  } catch {
    return null
  }
}

export function setViewAsSettings(settings: ViewAsSettings) {
  if (typeof window === 'undefined') return
  localStorage.setItem('viewAsSettings', JSON.stringify(settings))
}

export function clearViewAsSettings() {
  if (typeof window === 'undefined') return
  localStorage.removeItem('viewAsSettings')
}

export function applyViewAsOverride(profile: any, viewAsSettings: ViewAsSettings | null) {
  if (!viewAsSettings || !viewAsSettings.isViewingAs) {
    return profile
  }

  return {
    ...profile,
    role: viewAsSettings.role,
    plan_tier: viewAsSettings.plan_tier,
    _isViewingAs: true
  }
}
