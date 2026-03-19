import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getViewAsSettings, applyViewAsOverride } from '@/lib/view-as-server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams

    // Pagination parameters
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '12')
    const categoryId = searchParams.get('category') || ''
    const type = searchParams.get('type') || ''

    // Calculate offset
    const from = (page - 1) * limit
    const to = from + limit - 1

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile for role and plan tier
    let { data: profile } = await supabase
      .from('profiles')
      .select('role, plan_tier, is_admin')
      .eq('id', user.id)
      .single()

    // Apply view-as override if active
    const viewAsSettings = await getViewAsSettings()
    profile = applyViewAsOverride(profile, viewAsSettings)

    // Map "Premium Guest" to "Premium" for access checks
    const effectiveTier = profile?.plan_tier === 'Premium Guest' ? 'Premium' : profile?.plan_tier

    // Build query with content_type join (backward compatible)
    // Order by display_order first (0 means use default), then by created_at
    let query = supabase
      .from('resources')
      .select(`
        *,
        type:type_id(id, name, slug),
        category:category_id(id, name, slug, color)
      `)
      .eq('is_published', true)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })

    // Apply category filter if provided
    if (categoryId) {
      query = query.eq('category_id', categoryId)
    }

    // Apply type filter if provided (check both new and old fields)
    if (type) {
      // First try matching against type_id via slug
      const { data: contentType } = await supabase
        .from('content_types')
        .select('id')
        .eq('content_area', 'resources')
        .eq('slug', type)
        .single()

      if (contentType) {
        query = query.eq('type_id', contentType.id)
      } else {
        // Fallback to old resource_type enum field
        query = query.eq('resource_type', type)
      }
    }

    // Execute query - fetch ALL resources (no pagination yet)
    const { data: allResources, error } = await query

    if (error) {
      console.error('Error fetching resources:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Filter resources based on user access
    const filteredResources = (allResources || []).filter(resource => {
      // Admins can see everything
      if (profile?.is_admin) {
        return true
      }

      // Partners (vendors/lenders) can see everything
      if (profile?.role === 'partner_vendor' || profile?.role === 'partner_lender') {
        return true
      }

      // Check plan tier access
      const hasPlanAccess = !resource.required_plan_tier ||
        resource.required_plan_tier.length === 0 ||
        resource.required_plan_tier.includes(effectiveTier)

      return hasPlanAccess
    })

    // Apply pagination to filtered results
    const totalFiltered = filteredResources.length
    const paginatedResources = filteredResources.slice(from, from + limit)

    return NextResponse.json({
      resources: paginatedResources,
      pagination: {
        page,
        limit,
        total: totalFiltered,
        totalPages: Math.ceil(totalFiltered / limit)
      }
    })
  } catch (error) {
    console.error('Error in resources API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
