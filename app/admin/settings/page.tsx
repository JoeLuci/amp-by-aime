import { createClient } from '@/lib/supabase/server'
import { AdminSettings } from '@/components/admin/AdminSettings'

export default async function SettingsPage() {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="p-6">
        <h1 className="text-3xl font-bold text-gray-900">Unauthorized</h1>
        <p className="text-gray-600">You must be logged in to access settings.</p>
      </div>
    )
  }

  // Get user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen">
      {/* Page Header */}
      <div className="px-4 md:px-8 py-6 md:py-8">
        <h1 className="text-3xl md:text-4xl font-bold text-[#dd1969] mb-2">
          SETTINGS
        </h1>
        <p className="text-gray-600 text-sm md:text-base">
          Manage your account settings and preferences
        </p>
      </div>

      {/* Settings Content */}
      <div className="px-4 md:px-8 pb-8">
        <AdminSettings user={user} profile={profile} />
      </div>
    </div>
  )
}
