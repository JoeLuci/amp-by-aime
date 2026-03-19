'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getImpersonationSettingsClient, type ImpersonationSettings } from '@/lib/impersonation'

interface EffectiveUser {
  id: string
  email: string
  isImpersonating: boolean
  impersonationSettings: ImpersonationSettings | null
  isLoading: boolean
}

/**
 * Hook to get the effective user ID for data fetching.
 * Returns the impersonated user's ID if impersonating, otherwise the auth user's ID.
 */
export function useEffectiveUser(): EffectiveUser {
  const [effectiveUser, setEffectiveUser] = useState<EffectiveUser>({
    id: '',
    email: '',
    isImpersonating: false,
    impersonationSettings: null,
    isLoading: true,
  })

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setEffectiveUser({
          id: '',
          email: '',
          isImpersonating: false,
          impersonationSettings: null,
          isLoading: false,
        })
        return
      }

      // Check for impersonation
      const impersonationSettings = getImpersonationSettingsClient()

      if (impersonationSettings?.isImpersonating && impersonationSettings.impersonatedUserId) {
        setEffectiveUser({
          id: impersonationSettings.impersonatedUserId,
          email: impersonationSettings.impersonatedUserEmail,
          isImpersonating: true,
          impersonationSettings,
          isLoading: false,
        })
      } else {
        setEffectiveUser({
          id: user.id,
          email: user.email || '',
          isImpersonating: false,
          impersonationSettings: null,
          isLoading: false,
        })
      }
    }

    loadUser()
  }, [])

  return effectiveUser
}
