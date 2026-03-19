import { createClient } from '@/lib/supabase/server'
import { Users, UserCheck, Building2, FileText, Calendar, Tag, UserPlus, Clock, Plus } from 'lucide-react'
import { format } from 'date-fns'

export default async function AdminDashboardPage() {
  const supabase = await createClient()

  // Calculate date ranges
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()

  // Fetch all metrics in parallel for better performance
  const [
    { count: totalUsers },
    { count: adminUsers },
    { count: totalVendors },
    { count: totalLenders },
    { count: totalResources },
    { count: totalEvents },
    { count: totalCategories },
    { count: totalTags },
    { data: newUsers },
    { data: upcomingEvents },
    { data: recentResources }
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_admin', false)
      .not('role', 'in', '(partner_lender,partner_vendor)')
      .not('plan_tier', 'in', '("None","Pending Checkout")')
      .not('plan_tier', 'is', null),
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_admin', true),
    supabase
      .from('vendors')
      .select('*', { count: 'exact', head: true }),
    supabase
      .from('lenders')
      .select('*', { count: 'exact', head: true }),
    supabase
      .from('resources')
      .select('*', { count: 'exact', head: true }),
    supabase
      .from('events')
      .select('*', { count: 'exact', head: true }),
    supabase
      .from('categories')
      .select('*', { count: 'exact', head: true }),
    supabase
      .from('tags')
      .select('*', { count: 'exact', head: true }),
    // New users in last 7 days (paid only)
    supabase
      .from('profiles')
      .select('id, full_name, email, plan_tier, created_at')
      .eq('is_admin', false)
      .not('role', 'in', '(partner_lender,partner_vendor)')
      .not('plan_tier', 'in', '("None","Pending Checkout")')
      .not('plan_tier', 'is', null)
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(5),
    // Upcoming events in next 7 days
    supabase
      .from('events')
      .select('id, title, start_date, event_type')
      .gte('start_date', now.toISOString())
      .lte('start_date', sevenDaysFromNow)
      .order('start_date', { ascending: true })
      .limit(5),
    // Recently added resources
    supabase
      .from('resources')
      .select('id, title, resource_type, created_at')
      .order('created_at', { ascending: false })
      .limit(5)
  ])

  const metrics = [
    {
      title: 'Total Users',
      value: totalUsers || 0,
      icon: Users,
      color: 'bg-blue-500',
      href: '/admin/users'
    },
    {
      title: 'Admin Users',
      value: adminUsers || 0,
      icon: UserCheck,
      color: 'bg-purple-500',
      href: '/admin/admins'
    },
    {
      title: 'Vendors',
      value: totalVendors || 0,
      icon: Building2,
      color: 'bg-green-500',
      href: '/admin/vendors'
    },
    {
      title: 'Lenders',
      value: totalLenders || 0,
      icon: Building2,
      color: 'bg-emerald-500',
      href: '/admin/lenders'
    },
    {
      title: 'Resources',
      value: totalResources || 0,
      icon: FileText,
      color: 'bg-orange-500',
      href: '/admin/resources'
    },
    {
      title: 'Events',
      value: totalEvents || 0,
      icon: Calendar,
      color: 'bg-pink-500',
      href: '/admin/events'
    },
  ]

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
        <p className="text-gray-600">Overview of platform metrics and activity</p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {metrics.map((metric) => {
          const Icon = metric.icon
          return (
            <a
              key={metric.title}
              href={metric.href}
              className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`${metric.color} p-3 rounded-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
              <h3 className="text-gray-600 text-sm font-medium mb-1">{metric.title}</h3>
              <p className="text-3xl font-bold text-gray-900">{metric.value}</p>
            </a>
          )
        })}
      </div>

      {/* Recent Activity Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* New Users */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-bold text-gray-900">New Users</h2>
            <span className="text-xs text-gray-500">(Last 7 days)</span>
          </div>
          {newUsers && newUsers.length > 0 ? (
            <ul className="space-y-3">
              {newUsers.map((user) => (
                <li key={user.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{user.full_name || 'No name'}</p>
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
                  </div>
                  <span className="ml-2 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                    {user.plan_tier}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm text-center py-4">No new users this week</p>
          )}
          <a href="/admin/users" className="block mt-4 text-sm text-[#dd1969] hover:underline text-center">
            View all users →
          </a>
        </div>

        {/* Upcoming Events */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-pink-500" />
            <h2 className="text-lg font-bold text-gray-900">Upcoming Events</h2>
            <span className="text-xs text-gray-500">(Next 7 days)</span>
          </div>
          {upcomingEvents && upcomingEvents.length > 0 ? (
            <ul className="space-y-3">
              {upcomingEvents.map((event) => (
                <li key={event.id} className="py-2 border-b border-gray-100 last:border-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{event.title}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-gray-500">
                      {format(new Date(event.start_date), 'MMM d, yyyy • h:mm a')}
                    </p>
                    <span className="px-2 py-0.5 text-xs font-medium bg-pink-100 text-pink-800 rounded capitalize">
                      {event.event_type}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm text-center py-4">No upcoming events</p>
          )}
          <a href="/admin/events" className="block mt-4 text-sm text-[#dd1969] hover:underline text-center">
            View all events →
          </a>
        </div>

        {/* Recent Resources */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center gap-2 mb-4">
            <Plus className="w-5 h-5 text-orange-500" />
            <h2 className="text-lg font-bold text-gray-900">Recent Resources</h2>
          </div>
          {recentResources && recentResources.length > 0 ? (
            <ul className="space-y-3">
              {recentResources.map((resource) => (
                <li key={resource.id} className="py-2 border-b border-gray-100 last:border-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{resource.title}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-gray-500">
                      {format(new Date(resource.created_at), 'MMM d, yyyy')}
                    </p>
                    <span className="px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-800 rounded capitalize">
                      {resource.resource_type}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm text-center py-4">No resources yet</p>
          )}
          <a href="/admin/resources" className="block mt-4 text-sm text-[#dd1969] hover:underline text-center">
            View all resources →
          </a>
        </div>
      </div>
    </div>
  )
}
