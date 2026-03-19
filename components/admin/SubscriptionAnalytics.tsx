'use client'

import { Card } from '@/components/ui/card'
import { SubscriptionAnalyticsData } from '@/types/database.types'
import { DollarSign, Users, TrendingUp, BarChart3 } from 'lucide-react'

interface SubscriptionAnalyticsProps {
  analytics: SubscriptionAnalyticsData
}

// Define plan tier order (highest to lowest)
const PLAN_TIER_ORDER = [
  'VIP',
  'VIP Processor',
  'Elite',
  'Elite Processor',
  'Premium',
  'Premium Processor',
  'Premium Guest',
]

export function SubscriptionAnalytics({ analytics }: SubscriptionAnalyticsProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  // Sort plan distribution by tier hierarchy
  const sortedPlanDistribution = [...analytics.plan_distribution].sort((a, b) => {
    const aIndex = PLAN_TIER_ORDER.indexOf(a.plan_tier)
    const bIndex = PLAN_TIER_ORDER.indexOf(b.plan_tier)
    // If not in list, put at end
    if (aIndex === -1 && bIndex === -1) return 0
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })

  const stats = [
    {
      name: 'Monthly Recurring Revenue',
      value: formatCurrency(analytics.mrr),
      icon: DollarSign,
      color: 'bg-green-100 text-green-600',
    },
    {
      name: 'Active Subscriptions',
      value: analytics.active_subscriptions.toLocaleString(),
      icon: Users,
      subtext: `of ${analytics.total_users} total users`,
      color: 'bg-blue-100 text-blue-600',
    },
    {
      name: 'Annual Recurring Revenue',
      value: formatCurrency(analytics.arr),
      icon: TrendingUp,
      subtext: 'Projected ARR',
      color: 'bg-purple-100 text-purple-600',
    },
    {
      name: 'Churn Rate',
      value: `${analytics.churn_rate.toFixed(1)}%`,
      icon: BarChart3,
      color: analytics.churn_rate <= 5 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Main Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.name} className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    {stat.name}
                  </p>
                  <p className="text-2xl font-bold mt-2">{stat.value}</p>
                  {stat.subtext && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {stat.subtext}
                    </p>
                  )}
                </div>
                <div className="ml-4">
                  <div className={`p-3 rounded-lg ${stat.color}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Plan Distribution */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Plan Distribution</h3>
        <div className="space-y-4">
          {sortedPlanDistribution.map((plan) => (
            <div key={plan.plan_tier}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{plan.plan_tier}</span>
                <span className="text-sm text-muted-foreground">
                  {plan.count} users ({plan.percentage.toFixed(1)}%)
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${plan.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
