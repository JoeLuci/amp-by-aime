'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SubscriptionAnalytics } from './SubscriptionAnalytics'
import { SubscriptionsTable } from './SubscriptionsTable'
import { PendingCheckoutsTable } from './PendingCheckoutsTable'
import { AbandonedCartTable } from './AbandonedCartTable'
import { Profile, SubscriptionPlan, SubscriptionAnalyticsData } from '@/types/database.types'
import { BarChart3, Clock, Users, ShoppingCart, CreditCard } from 'lucide-react'

interface PendingCheckout {
  id: string
  user_email: string
  plan_name: string | null
  plan_price: number | null
  billing_period: string | null
  checkout_url: string | null
  status: 'pending' | 'sent' | 'completed' | 'expired' | 'canceled'
  sent_method: 'email' | 'copied' | 'manual' | null
  expires_at: string | null
  created_at: string
  completed_at: string | null
  notes: string | null
}

interface AbandonedUser {
  id: string
  email?: string
  full_name?: string
  first_name?: string
  last_name?: string
  role?: string
  company_name?: string
  phone?: string
  plan_tier?: string
  subscription_status?: string
  created_at: string
  onboarding_step?: string
}

interface SubscriptionsDashboardProps {
  analytics: SubscriptionAnalyticsData
  pendingCheckouts: PendingCheckout[]
  subscriptions: Profile[]
  plans: SubscriptionPlan[]
  abandonedUsers: AbandonedUser[]
  isSuperAdmin?: boolean
}

export function SubscriptionsDashboard({
  analytics,
  pendingCheckouts,
  subscriptions,
  plans,
  abandonedUsers,
  isSuperAdmin = false,
}: SubscriptionsDashboardProps) {
  const searchParams = useSearchParams()

  // Check if we should open subscribers tab (when redirected from All Users with ?user=)
  const hasUserParam = searchParams.get('user')
  const [activeTab, setActiveTab] = useState(hasUserParam ? 'subscribers' : 'analytics')

  // Update tab when URL params change
  useEffect(() => {
    if (searchParams.get('user')) {
      setActiveTab('subscribers')
    }
  }, [searchParams])

  // Count pending checkouts that need attention
  const pendingCount = pendingCheckouts.filter(
    (c) => c.status === 'pending' || c.status === 'sent'
  ).length

  // Count abandoned cart users
  const abandonedCount = abandonedUsers?.length || 0

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="mb-6">
        <TabsTrigger value="analytics" className="gap-2">
          <BarChart3 className="w-4 h-4" />
          Analytics
        </TabsTrigger>
        <TabsTrigger value="subscribers" className="gap-2">
          <CreditCard className="w-4 h-4" />
          Subscriptions
        </TabsTrigger>
        <TabsTrigger value="checkouts" className="gap-2">
          <Clock className="w-4 h-4" />
          Pending Checkouts
          {pendingCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-yellow-500 text-white">
              {pendingCount}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="abandoned" className="gap-2">
          <ShoppingCart className="w-4 h-4" />
          Abandoned Cart
          {abandonedCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-orange-500 text-white">
              {abandonedCount}
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="analytics">
        <SubscriptionAnalytics analytics={analytics} />
      </TabsContent>

      <TabsContent value="subscribers">
        <SubscriptionsTable
          initialSubscriptions={subscriptions}
          plans={plans}
          isSuperAdmin={isSuperAdmin}
        />
      </TabsContent>

      <TabsContent value="checkouts">
        <PendingCheckoutsTable checkouts={pendingCheckouts} plans={plans} />
      </TabsContent>

      <TabsContent value="abandoned">
        <AbandonedCartTable users={abandonedUsers || []} plans={plans} />
      </TabsContent>
    </Tabs>
  )
}
