import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PlansManager } from '@/components/admin/PlansManager'
import { SubscriptionPlan } from '@/types/database.types'

export const dynamic = 'force-dynamic'

export default async function PlansPage() {
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

  // Fetch all subscription plans (including inactive)
  const { data: plans, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('Error fetching plans:', error)
  }

  return (
    <div className="p-8">
      <PlansManager
        initialPlans={(plans as SubscriptionPlan[]) || []}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  )
}
