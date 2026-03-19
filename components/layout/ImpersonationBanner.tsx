'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { UserCheck, LogOut } from 'lucide-react'
import { getImpersonationSettingsClient, type ImpersonationSettings } from '@/lib/impersonation'

export function ImpersonationBanner() {
  const router = useRouter()
  const [settings, setSettings] = useState<ImpersonationSettings | null>(null)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    // Read impersonation settings from cookie
    const impersonationSettings = getImpersonationSettingsClient()
    setSettings(impersonationSettings)
  }, [])

  const handleExitImpersonation = async () => {
    setIsExiting(true)
    try {
      await fetch('/api/admin/impersonate', { method: 'DELETE' })
      router.push('/admin/users')
      router.refresh()
    } catch (error) {
      console.error('Error exiting impersonation:', error)
      setIsExiting(false)
    }
  }

  if (!settings || !settings.isImpersonating) {
    return null
  }

  return (
    <div className="bg-red-600 text-white px-4 py-3 flex items-center justify-between shadow-md sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <UserCheck className="w-5 h-5" />
        <div>
          <p className="font-semibold text-sm">
            Impersonation Mode Active
          </p>
          <p className="text-xs opacity-90">
            Logged in as: <span className="font-semibold">{settings.impersonatedUserName}</span>
            {settings.impersonatedUserEmail && (
              <span> ({settings.impersonatedUserEmail})</span>
            )}
          </p>
        </div>
      </div>
      <Button
        onClick={handleExitImpersonation}
        disabled={isExiting}
        variant="outline"
        size="sm"
        className="bg-white hover:bg-gray-100 text-red-600 border-red-300"
      >
        <LogOut className="w-4 h-4 mr-2" />
        {isExiting ? 'Exiting...' : 'Exit & Return to Admin'}
      </Button>
    </div>
  )
}
