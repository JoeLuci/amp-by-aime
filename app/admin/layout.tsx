import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { AdminMobileHeader } from '@/components/admin/AdminMobileHeader'
import { AdminMobileNav } from '@/components/admin/AdminMobileNav'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  // Check if user is authenticated
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/admin/login')
  }

  // Check if user is admin (AIME team member)
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, full_name, avatar_url')
    .eq('id', user.id)
    .single()

  // Enforce admin-only access (AIME team only)
  if (!profile?.is_admin) {
    redirect('/dashboard')
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Desktop Sidebar */}
      <AdminSidebar profile={profile} />

      {/* Mobile Header */}
      <AdminMobileHeader />

      {/* Main content area - responsive margins for sidebar and mobile */}
      <div className="flex-1 flex flex-col overflow-hidden md:ml-64 pt-[108px] md:pt-0 pb-16 md:pb-0">
        {/* Desktop Header */}
        <div className="hidden md:block">
          <AdminHeader profile={profile} />
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <AdminMobileNav />
    </div>
  )
}
