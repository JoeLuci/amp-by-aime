import { createClient } from '@/lib/supabase/server'
import { UsersTable } from '@/components/admin/UsersTable'
import { Profile } from '@/types/database.types'

export const dynamic = 'force-dynamic'

// Helper to fetch all records in batches (Supabase limits to 1000 per request)
async function fetchAllProfiles(supabase: any): Promise<Profile[]> {
  const allProfiles: Profile[] = []
  const batchSize = 1000
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['loan_officer', 'broker_owner', 'loan_officer_assistant', 'processor'])
      .eq('is_admin', false)
      .not('plan_tier', 'in', '("None","Pending Checkout")')
      .not('plan_tier', 'is', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + batchSize - 1)

    if (error) {
      console.error('Error fetching users batch:', JSON.stringify(error, null, 2))
      break
    }

    if (data && data.length > 0) {
      allProfiles.push(...data)
      offset += batchSize
      hasMore = data.length === batchSize
    } else {
      hasMore = false
    }
  }

  return allProfiles
}

export default async function ManageUsersPage() {
  const supabase = await createClient()

  // Get current admin's role
  const { data: { user } } = await supabase.auth.getUser()
  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user?.id || '')
    .single()

  const isSuperAdmin = adminProfile?.role === 'super_admin'

  // Fetch all users in batches to bypass Supabase 1000 row limit
  const profiles = await fetchAllProfiles(supabase)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Manage Users</h1>
        <p className="text-gray-600">View and manage all platform users</p>
      </div>

      <UsersTable users={profiles || []} isSuperAdmin={isSuperAdmin} />
    </div>
  )
}
