import { createClient } from '@/lib/supabase/server'
import { AdminsTable } from '@/components/admin/AdminsTable'

export default async function AdminsPage() {
  const supabase = await createClient()

  // Fetch all admin users (users with is_admin = true)
  const { data: admins, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('is_admin', true)
    .order('created_at', { ascending: false })
    .range(0, 9999)

  if (error) {
    console.error('Error fetching admins:', error)
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Users</h1>
        <p className="text-gray-600">Manage platform administrators</p>
      </div>

      <AdminsTable admins={admins || []} />
    </div>
  )
}
