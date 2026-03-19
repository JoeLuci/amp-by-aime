import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SubscriptionsDashboard } from '@/components/admin/SubscriptionsDashboard'
import { Profile, SubscriptionPlan, SubscriptionAnalyticsData } from '@/types/database.types'

export const dynamic = 'force-dynamic'

const SUBSCRIPTION_FIELDS = `
  id,
  email,
  full_name,
  first_name,
  last_name,
  phone,
  role,
  plan_tier,
  stripe_customer_id,
  stripe_subscription_id,
  subscription_status,
  trial_start_date,
  trial_end_date,
  pending_plan_tier,
  pending_plan_effective_date,
  escalations_remaining,
  has_completed_trial,
  engagement_level,
  last_login_at,
  ghl_contact_id,
  created_at,
  updated_at
`

// Helper to fetch all subscriptions in batches (Supabase limits to 1000 per request)
async function fetchAllSubscriptions(supabase: any): Promise<Profile[]> {
  const allSubs: Profile[] = []
  const batchSize = 1000
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await supabase
      .from('profiles')
      .select(SUBSCRIPTION_FIELDS)
      .neq('is_admin', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + batchSize - 1)

    if (error) {
      console.error('Error fetching subscriptions batch:', error)
      break
    }

    if (data && data.length > 0) {
      allSubs.push(...data)
      offset += batchSize
      hasMore = data.length === batchSize
    } else {
      hasMore = false
    }
  }

  return allSubs
}

// Helper to fetch all abandoned users in batches
async function fetchAllAbandonedUsers(supabase: any): Promise<Profile[]> {
  const allUsers: Profile[] = []
  const batchSize = 1000
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['loan_officer', 'broker_owner', 'loan_officer_assistant', 'processor'])
      .eq('is_admin', false)
      .or('plan_tier.is.null,plan_tier.eq.Pending Checkout,plan_tier.eq.None')
      .order('created_at', { ascending: false })
      .range(offset, offset + batchSize - 1)

    if (error) {
      console.error('Error fetching abandoned users batch:', error)
      break
    }

    if (data && data.length > 0) {
      allUsers.push(...data)
      offset += batchSize
      hasMore = data.length === batchSize
    } else {
      hasMore = false
    }
  }

  return allUsers
}

export default async function SubscriptionsPage() {
  const supabase = await createClient()

  // Check if user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/admin/login')
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, role')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    redirect('/dashboard')
  }

  const isSuperAdmin = profile.role === 'super_admin'

  // Fetch all user subscriptions in batches (exclude admin users)
  const subscriptions = await fetchAllSubscriptions(supabase)

  // Fetch all active subscription plans
  const { data: plans, error: plansError } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (plansError) {
    console.error('Error fetching plans:', plansError)
  }

  // Fetch pending checkouts
  const { data: pendingCheckouts, error: checkoutsError } = await supabase
    .from('pending_checkouts')
    .select('id, user_email, plan_id, plan_name, plan_price, billing_period, checkout_url, status, sent_method, expires_at, created_at, completed_at, notes')
    .order('created_at', { ascending: false })

  if (checkoutsError) {
    console.error('Error fetching pending checkouts:', checkoutsError)
  }

  // Fetch abandoned cart users in batches
  const abandonedUsers = await fetchAllAbandonedUsers(supabase)

  // Filter out users with active subscriptions
  const filteredAbandonedUsers = (abandonedUsers || []).filter(user =>
    !user.subscription_status ||
    (user.subscription_status !== 'active' && user.subscription_status !== 'trialing')
  )

  // Calculate analytics
  const users = (subscriptions as Profile[]) || []

  // Paid tiers (exclude Free, Pending Checkout, and null)
  const paidTiers = ['VIP', 'VIP Processor', 'Elite', 'Elite Processor', 'Premium', 'Premium Processor', 'Premium Guest']

  // Active subscriptions = users with paid plan_tiers OR active subscription_status
  const activeSubscriptions = users.filter(
    (u) => paidTiers.includes(u.plan_tier || '') ||
           u.subscription_status === 'active' ||
           u.subscription_status === 'trialing'
  )

  // Calculate plan distribution (only paid tiers, exclude Pending Checkout/Free/null)
  const paidUsers = users.filter(u => paidTiers.includes(u.plan_tier || ''))
  const planCounts = paidUsers.reduce((acc: Record<string, number>, user) => {
    const tier = user.plan_tier!
    acc[tier] = (acc[tier] || 0) + 1
    return acc
  }, {})

  const planDistribution = Object.entries(planCounts).map(([tier, count]) => ({
    plan_tier: tier as any,
    count,
    percentage: paidUsers.length > 0 ? (count / paidUsers.length) * 100 : 0,
  }))

  // Calculate MRR (Monthly Recurring Revenue) based on paid users
  // Build a map of plan_tier -> monthly price (use monthly price or annual/12)
  const plansArray = (plans as SubscriptionPlan[]) || []
  const tierPrices: Record<string, number> = {}

  plansArray.forEach((plan) => {
    const monthlyPrice = plan.billing_period === 'annual'
      ? Number(plan.price) / 12
      : Number(plan.price)
    // Keep the higher price if multiple billing periods exist (assume most pay monthly)
    if (!tierPrices[plan.plan_tier] || plan.billing_period === 'monthly') {
      tierPrices[plan.plan_tier] = monthlyPrice
    }
  })

  let mrr = 0
  activeSubscriptions.forEach((sub) => {
    const monthlyPrice = tierPrices[sub.plan_tier || '']
    if (monthlyPrice) {
      mrr += monthlyPrice
    }
  })

  // Calculate ARR (Annual Recurring Revenue)
  const arr = mrr * 12

  // Churn rate would need historical data to calculate properly
  // For now, show 0 if no users or no churned users
  const churnRate = 0

  const analytics: SubscriptionAnalyticsData = {
    mrr,
    arr,
    active_subscriptions: activeSubscriptions.length,
    total_users: users.length,
    plan_distribution: planDistribution,
    growth_rate: 0,
    churn_rate: churnRate,
  }

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Subscriptions Overview</h1>
        <p className="text-muted-foreground mt-2">
          Monitor and manage all user subscriptions
        </p>
      </div>

      <SubscriptionsDashboard
        analytics={analytics}
        pendingCheckouts={pendingCheckouts || []}
        subscriptions={users}
        plans={(plans as SubscriptionPlan[]) || []}
        abandonedUsers={filteredAbandonedUsers}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  )
}
