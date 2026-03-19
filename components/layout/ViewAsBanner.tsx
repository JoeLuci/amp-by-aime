'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Eye, X } from 'lucide-react'
import { getViewAsSettings, clearViewAsSettings } from '@/lib/view-as'

// Map database role values to friendly display names
const ROLE_DISPLAY_NAMES: Record<string, string> = {
  'loan_officer': 'Loan Officer',
  'broker_owner': 'Broker Owner',
  'loan_officer_assistant': 'Loan Officer Assistant',
  'processor': 'Processor',
  'admin': 'Admin',
}

export function ViewAsBanner() {
  const router = useRouter()
  const [viewAsSettings, setViewAsSettings] = useState<any>(null)

  useEffect(() => {
    // Read from cookie
    const cookieValue = document.cookie
      .split('; ')
      .find(row => row.startsWith('viewAsSettings='))
      ?.split('=')[1]

    if (cookieValue) {
      try {
        const settings = JSON.parse(decodeURIComponent(cookieValue))
        setViewAsSettings(settings)
      } catch (e) {
        console.error('Error parsing viewAsSettings:', e)
      }
    }
  }, [])

  const handleExitViewAs = async () => {
    try {
      await fetch('/api/admin/view-as', { method: 'DELETE' })
      router.push('/admin')
      router.refresh()
    } catch (error) {
      console.error('Error exiting view-as:', error)
    }
  }

  if (!viewAsSettings || !viewAsSettings.isViewingAs) {
    return null
  }

  return (
    <div className="bg-yellow-500 text-yellow-900 px-4 py-3 flex items-center justify-between shadow-md">
      <div className="flex items-center gap-3">
        <Eye className="w-5 h-5" />
        <div>
          <p className="font-semibold text-sm">
            Preview Mode Active
          </p>
          <p className="text-xs">
            Viewing as: <span className="font-semibold">{ROLE_DISPLAY_NAMES[viewAsSettings.role] || viewAsSettings.role}</span> • <span className="font-semibold">{viewAsSettings.plan_tier}</span> plan
            {viewAsSettings.specificUserName && (
              <span> • User: <span className="font-semibold">{viewAsSettings.specificUserName}</span></span>
            )}
          </p>
        </div>
      </div>
      <Button
        onClick={handleExitViewAs}
        variant="outline"
        size="sm"
        className="bg-white hover:bg-gray-100 text-yellow-900 border-yellow-700"
      >
        <X className="w-4 h-4 mr-2" />
        Exit Preview
      </Button>
    </div>
  )
}
