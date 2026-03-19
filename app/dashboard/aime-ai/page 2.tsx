import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getViewAsSettings, applyViewAsOverride } from '@/lib/view-as-server'
import { UpgradeBanner } from '@/components/ui/upgrade-banner'

export default async function AIMEAIPage() {
  const supabase = await createClient()

  // Get current user for access control
  const { data: { user } } = await supabase.auth.getUser()
  let { data: profile } = await supabase
    .from('profiles')
    .select('plan_tier, is_admin')
    .eq('id', user?.id)
    .single()

  // Apply view-as override if active
  const viewAsSettings = await getViewAsSettings()
  profile = applyViewAsOverride(profile, viewAsSettings)

  // AIME AI is only available for Premium, Elite, VIP (and their Processor variants)
  // Free and Premium Guest do NOT have access
  const allowedTiers = ['Premium', 'Elite', 'VIP', 'Premium Processor', 'Elite Processor', 'VIP Processor']
  const hasAccess = profile?.is_admin || allowedTiers.includes(profile?.plan_tier || '')

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

      {/* Chat Area */}
      <div className="flex-1 px-4 md:px-8 pb-8">
        <div className="max-w-4xl mx-auto h-full flex flex-col">
          {/* Messages Area */}
          <div className="flex-1 bg-white rounded-lg shadow-md p-6 mb-4 overflow-y-auto">
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <p className="text-lg font-medium mb-2">AIME AI Assistant</p>
                <p className="text-sm">Ask me anything about mortgages, lending, or AIME resources</p>
              </div>
            </div>
          </div>

          {/* Input Area */}
          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Type your message..."
                className="flex-1"
              />
              <Button className="bg-[#dd1969] hover:bg-[#c01559] text-white">
                <Send className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
