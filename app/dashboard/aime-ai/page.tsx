'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { UpgradeBanner } from '@/components/ui/upgrade-banner'

export default function AIMEAIPage() {
  console.log('🚀 AIME AI PAGE LOADED - v2')

  const [loading, setLoading] = useState(true)
  const [hasAccess, setHasAccess] = useState(false)
  const [iframeUrl, setIframeUrl] = useState('')

  useEffect(() => {
    console.log('🔥 AIME AI useEffect running')
    async function loadUserData() {
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan_tier, is_admin, subscription_status, bubble_user_id')
        .eq('id', user?.id)
        .single()

      // AIME AI is only available for PAID tiers (Premium, Elite, VIP and their Processor variants)
      const allowedTiers = ['Premium', 'Elite', 'VIP', 'Premium Processor', 'Elite Processor', 'VIP Processor']
      const isTrialing = profile?.subscription_status === 'trialing'
      const access = profile?.is_admin || (allowedTiers.includes(profile?.plan_tier || '') && !isTrialing)

      // Build iframe URL with user ID and bubble user ID
      const url = `https://aime-production.up.railway.app?id=${user?.id || ''}&bubble.id=${profile?.bubble_user_id || ''}`

      // Log to browser console for debugging
      console.log('AIME AI iframe injection:', {
        id: user?.id || '',
        'bubble.id': profile?.bubble_user_id || '',
        fullUrl: url
      })

      setHasAccess(access)
      setIframeUrl(url)
      setLoading(false)
    }

    loadUserData()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#dd1969]"></div>
      </div>
    )
  }

  // Show upgrade banner if no access
  if (!hasAccess) {
    return (
      <div className="min-h-screen flex flex-col">
        {/* Page Header */}
        <div className="px-4 md:px-8 py-6 md:py-8">
          <h1 className="text-3xl md:text-4xl font-bold text-[#dd1969] mb-2">
            AIME AI
          </h1>
          <p className="text-gray-600 text-sm md:text-base">
            Your AI-powered assistant for mortgage insights
          </p>
        </div>

        {/* Upgrade Banner */}
        <div className="px-4 md:px-8 py-6 md:py-8">
          <UpgradeBanner
            title="Upgrade To Paid Membership for Access to AIME's AI Assistant"
            description="For as low as $19.99/mo you gain access to The Architect, an AI Bot for Lender Scenarios"
            requiredTiers={['Premium', 'Elite', 'VIP']}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-120px)] md:h-[calc(100vh-80px)]">
      <iframe
        src={iframeUrl}
        className="w-full h-full border-none rounded-lg"
        allow="microphone"
      />
    </div>
  )
}
