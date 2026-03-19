import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q') || ''

  if (!query.trim()) {
    return NextResponse.json({ results: [] })
  }

  const supabase = await createClient()

  // Get current user and verify admin access
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const searchTerm = `%${query.toLowerCase()}%`

  // Search Resources (all, not just published)
  const { data: resources } = await supabase
    .from('resources')
    .select(`
      id,
      title,
      sub_title,
      description,
      slug,
      is_published,
      category:category_id (name, color)
    `)
    .or(`title.ilike.${searchTerm},sub_title.ilike.${searchTerm},description.ilike.${searchTerm}`)

  // Search Lenders (all, not just active)
  const { data: lenders } = await supabase
    .from('lenders')
    .select(`
      id,
      name,
      description,
      slug,
      logo_url,
      is_active,
      category:category_id (name, color)
    `)
    .or(`name.ilike.${searchTerm},description.ilike.${searchTerm}`)

  // Search Vendors (all, not just active)
  const { data: vendors } = await supabase
    .from('vendors')
    .select(`
      id,
      name,
      description,
      slug,
      logo_url,
      is_active,
      category:category_id (name, color)
    `)
    .or(`name.ilike.${searchTerm},description.ilike.${searchTerm}`)

  // Search Events (all, including past)
  const { data: events } = await supabase
    .from('events')
    .select(`
      id,
      title,
      description,
      event_type,
      start_date,
      thumbnail_url,
      is_published,
      type:type_id (name, color)
    `)
    .or(`title.ilike.${searchTerm},description.ilike.${searchTerm}`)

  // Search Users
  const { data: users } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, is_admin, plan_tier, company_name')
    .or(`full_name.ilike.${searchTerm},email.ilike.${searchTerm},company_name.ilike.${searchTerm}`)
    .limit(20)

  // Search Subscription Plans
  const { data: subscriptionPlans } = await supabase
    .from('subscription_plans')
    .select('id, name, plan_tier, billing_period, price, is_active')
    .or(`name.ilike.${searchTerm},plan_tier.ilike.${searchTerm}`)

  // Search Pending Checkouts
  const { data: pendingCheckouts } = await supabase
    .from('pending_checkouts')
    .select('id, user_email, plan_name, status, created_at')
    .or(`user_email.ilike.${searchTerm},plan_name.ilike.${searchTerm}`)
    .limit(20)

  // Search Categories
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, content_area, color, is_active')
    .ilike('name', searchTerm)

  // Search Tags
  const { data: tags } = await supabase
    .from('tags')
    .select('id, name')
    .ilike('name', searchTerm)

  // Search Training Videos
  const { data: trainingVideos } = await supabase
    .from('admin_training_videos')
    .select('id, title, description, category, is_active')
    .or(`title.ilike.${searchTerm},description.ilike.${searchTerm}`)

  // Search Notifications
  const { data: notifications } = await supabase
    .from('notifications')
    .select('id, title, message, notification_type, created_at')
    .or(`title.ilike.${searchTerm},message.ilike.${searchTerm}`)
    .limit(20)

  // Format results with admin URLs that open the editor directly
  const results = [
    ...(resources || []).map(r => ({
      id: r.id,
      title: r.title,
      subtitle: r.sub_title,
      description: r.description,
      category: 'Resources',
      categoryColor: (r.category as any)?.color || '#6b7280',
      categoryName: (r.category as any)?.name || 'Uncategorized',
      url: `/admin/resources?edit=${r.id}`,
      status: r.is_published ? 'Published' : 'Draft'
    })),
    ...(lenders || []).map(l => ({
      id: l.id,
      title: l.name,
      description: l.description,
      category: 'Lenders',
      categoryColor: (l.category as any)?.color || '#94a3b8',
      categoryName: (l.category as any)?.name || 'Lender',
      url: `/admin/lenders?edit=${l.id}`,
      logo: l.logo_url,
      status: l.is_active ? 'Active' : 'Inactive'
    })),
    ...(vendors || []).map(v => ({
      id: v.id,
      title: v.name,
      description: v.description,
      category: 'Market Vendors',
      categoryColor: (v.category as any)?.color || '#0066cc',
      categoryName: (v.category as any)?.name || 'Vendor',
      url: `/admin/vendors?edit=${v.id}`,
      logo: v.logo_url,
      status: v.is_active ? 'Active' : 'Inactive'
    })),
    ...(events || []).map(e => ({
      id: e.id,
      title: e.title,
      description: e.description,
      category: 'Events',
      categoryColor: (e.type as any)?.color || '#dd1969',
      categoryName: (e.type as any)?.name || e.event_type || 'Event',
      url: `/admin/events?edit=${e.id}`,
      thumbnail: e.thumbnail_url,
      status: e.is_published ? 'Published' : 'Draft'
    })),
    ...(users || []).map(u => ({
      id: u.id,
      title: u.full_name || u.email,
      subtitle: u.email,
      description: `${u.company_name ? u.company_name + ' • ' : ''}${u.plan_tier || 'No plan'}`,
      category: 'Users',
      categoryColor: '#8b5cf6',
      categoryName: u.is_admin ? 'Admin' : (u.plan_tier || 'User'),
      url: u.is_admin ? `/admin/admins?edit=${u.id}` : `/admin/users?edit=${u.id}`,
    })),
    ...(subscriptionPlans || []).map(p => ({
      id: p.id,
      title: p.name,
      subtitle: `${p.plan_tier} - ${p.billing_period}`,
      description: `$${p.price} / ${p.billing_period}`,
      category: 'Subscriptions',
      categoryColor: '#059669',
      categoryName: 'Plan',
      url: `/admin/subscriptions/plans`,
      status: p.is_active ? 'Active' : 'Inactive'
    })),
    ...(pendingCheckouts || []).map(c => ({
      id: c.id,
      title: c.user_email,
      subtitle: c.plan_name,
      description: `Status: ${c.status}`,
      category: 'Subscriptions',
      categoryColor: '#f59e0b',
      categoryName: 'Pending Checkout',
      url: `/admin/subscriptions`,
      status: c.status === 'completed' ? 'Completed' : c.status === 'pending' ? 'Pending' : c.status
    })),
    ...(categories || []).map(c => ({
      id: c.id,
      title: c.name,
      subtitle: `Content Area: ${c.content_area}`,
      category: 'Content',
      categoryColor: c.color || '#6b7280',
      categoryName: 'Category',
      url: `/admin/categories`,
      status: c.is_active ? 'Active' : 'Inactive'
    })),
    ...(tags || []).map(t => ({
      id: t.id,
      title: t.name,
      category: 'Content',
      categoryColor: '#64748b',
      categoryName: 'Tag',
      url: `/admin/tags`,
    })),
    ...(trainingVideos || []).map(v => ({
      id: v.id,
      title: v.title,
      description: v.description,
      category: 'Training',
      categoryColor: '#dc2626',
      categoryName: v.category || 'Video',
      url: `/admin/training-videos`,
      status: v.is_active ? 'Active' : 'Hidden'
    })),
    ...(notifications || []).map(n => ({
      id: n.id,
      title: n.title,
      description: n.message,
      category: 'Notifications',
      categoryColor: '#0ea5e9',
      categoryName: n.notification_type || 'Notification',
      url: `/admin/notifications`,
    }))
  ]

  return NextResponse.json({ results })
}
