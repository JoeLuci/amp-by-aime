import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getViewAsSettings, applyViewAsOverride } from '@/lib/view-as-server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q') || ''

  if (!query.trim()) {
    return NextResponse.json({ results: [] })
  }

  const supabase = await createClient()

  // Get current user for access control
  const { data: { user } } = await supabase.auth.getUser()
  let { data: profile } = await supabase
    .from('profiles')
    .select('role, plan_tier, is_admin')
    .eq('id', user?.id)
    .single()

  // Apply view-as override if active
  const viewAsSettings = await getViewAsSettings()
  profile = applyViewAsOverride(profile, viewAsSettings)

  const searchTerm = `%${query.toLowerCase()}%`

  // Search Resources
  const { data: resources, error: resourcesError } = await supabase
    .from('resources')
    .select(`
      id,
      title,
      sub_title,
      description,
      slug,
      user_role_access,
      required_plan_tier,
      category:category_id (name, color),
      tags:resource_tags(tag:tag_id(name))
    `)
    .eq('is_published', true)
    .or(`title.ilike.${searchTerm},sub_title.ilike.${searchTerm},description.ilike.${searchTerm}`)

  if (resourcesError) {
    console.error('Resources search error:', resourcesError)
  }

  // Search Lenders
  const { data: lenders } = await supabase
    .from('lenders')
    .select(`
      id,
      name,
      description,
      slug,
      logo_url,
      products,
      features,
      user_role_access,
      required_plan_tier,
      category:category_id (name, color)
    `)
    .eq('is_active', true)
    .or(`name.ilike.${searchTerm},description.ilike.${searchTerm}`)

  // Search Vendors
  const { data: vendors } = await supabase
    .from('vendors')
    .select(`
      id,
      name,
      description,
      slug,
      logo_url,
      features,
      user_role_access,
      required_plan_tier,
      is_core_partner,
      category:category_id (name, color)
    `)
    .eq('is_active', true)
    .or(`name.ilike.${searchTerm},description.ilike.${searchTerm}`)

  // Search Events
  const { data: events } = await supabase
    .from('events')
    .select(`
      id,
      title,
      description,
      event_type,
      start_date,
      thumbnail_url,
      user_role_access,
      required_plan_tier,
      type:type_id (name, color)
    `)
    .eq('is_published', true)
    .gte('start_date', new Date().toISOString())
    .or(`title.ilike.${searchTerm},description.ilike.${searchTerm}`)

  // Helper function to check access
  const isPartner = profile?.role === 'partner_vendor' || profile?.role === 'partner_lender'
  const isGuestTier = profile?.plan_tier === 'Premium Guest' || profile?.plan_tier === 'Premium Processor Guest'

  // Map Premium Guest to Premium for plan tier checks (lenders)
  const effectivePlanTier = profile?.plan_tier === 'Premium Guest' ? 'Premium' : profile?.plan_tier

  const hasAccess = (item: any, itemType?: 'vendor' | 'lender' | 'resource' | 'event') => {
    // Admins and partners can see everything
    if (profile?.is_admin || isPartner) return true

    // Special handling for vendors: Premium Guest can ONLY see Core Vendor Partners
    if (itemType === 'vendor' && isGuestTier) {
      return item.is_core_partner === true
    }

    const hasRoleAccess = !item.user_role_access ||
      item.user_role_access.length === 0 ||
      item.user_role_access.includes(profile?.role)

    // Use effective plan tier for lenders (Premium Guest -> Premium)
    const tierToCheck = itemType === 'lender' ? effectivePlanTier : profile?.plan_tier
    const hasPlanAccess = !item.required_plan_tier ||
      item.required_plan_tier.length === 0 ||
      item.required_plan_tier.includes(tierToCheck)

    return hasRoleAccess && hasPlanAccess
  }

  // Filter by access and format results
  const results = [
    ...(resources || [])
      .filter(r => hasAccess(r, 'resource'))
      .map(r => ({
        id: r.id,
        title: r.title,
        subtitle: r.sub_title,
        description: r.description,
        category: 'Resources',
        categoryColor: (r.category as any)?.color || '#6b7280',
        categoryName: (r.category as any)?.name || 'Uncategorized',
        url: `/dashboard/resources/${r.slug}`,
        tags: r.tags?.map((t: any) => t.tag?.name).filter(Boolean) || []
      })),
    ...(lenders || [])
      .filter(l => hasAccess(l, 'lender'))
      .map(l => ({
        id: l.id,
        title: l.name,
        description: l.description,
        category: 'Lenders',
        categoryColor: (l.category as any)?.color || '#94a3b8',
        categoryName: (l.category as any)?.name || 'Lender',
        url: `/dashboard/lenders/${l.slug}`,
        logo: l.logo_url,
        tags: []
      })),
    ...(vendors || [])
      .filter(v => hasAccess(v, 'vendor'))
      .map(v => ({
        id: v.id,
        title: v.name,
        description: v.description,
        category: 'Market',
        categoryColor: (v.category as any)?.color || '#0066cc',
        categoryName: (v.category as any)?.name || 'Vendor',
        url: `/dashboard/market/${v.slug}`,
        logo: v.logo_url,
        tags: []
      })),
    // Exclude events for partners
    ...(!isPartner ? (events || [])
      .filter(e => hasAccess(e, 'event'))
      .map(e => ({
        id: e.id,
        title: e.title,
        description: e.description,
        category: 'Events',
        categoryColor: (e.type as any)?.color || '#dd1969',
        categoryName: (e.type as any)?.name || e.event_type || 'Event',
        url: `/dashboard/events/${e.id}`,
        thumbnail: e.thumbnail_url,
        tags: []
      })) : [])
  ]

  return NextResponse.json({ results })
}
