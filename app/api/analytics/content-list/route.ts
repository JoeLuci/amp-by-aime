import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    // Check authentication and admin access
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

    // Get params
    const contentType = searchParams.get('contentType')
    const startDate = searchParams.get('startDate') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const endDate = searchParams.get('endDate') || new Date().toISOString()

    if (!contentType || !['resource', 'vendor', 'lender', 'event'].includes(contentType)) {
      return NextResponse.json({ error: 'Invalid content type' }, { status: 400 })
    }

    // Get paid user IDs (exclude Free tier)
    const { data: paidUsers } = await supabase
      .from('profiles')
      .select('id')
      .neq('plan_tier', 'None')

    const paidUserIds = new Set((paidUsers || []).map(u => u.id))

    // Query analytics for this content type (only paid users)
    const { data: analytics, error: analyticsError } = await supabase
      .from('analytics_events')
      .select('content_id, content_title, event_type, user_id')
      .eq('content_type', contentType)
      .gte('created_at', startDate)
      .lte('created_at', endDate)

    if (analyticsError) {
      throw analyticsError
    }

    // Aggregate the data
    const contentMap = new Map<string, {
      content_id: string
      content_title: string
      views_count: number
      connections_count: number
      unique_users: Set<string>
    }>()

    for (const event of analytics || []) {
      if (!event.content_id) continue
      // Skip Free tier users
      if (!event.user_id || !paidUserIds.has(event.user_id)) continue

      if (!contentMap.has(event.content_id)) {
        contentMap.set(event.content_id, {
          content_id: event.content_id,
          content_title: event.content_title || 'Untitled',
          views_count: 0,
          connections_count: 0,
          unique_users: new Set()
        })
      }

      const item = contentMap.get(event.content_id)!
      if (event.event_type === 'view') item.views_count++
      if (event.user_id) item.unique_users.add(event.user_id)
    }

    // For vendors and lenders, get actual connection counts from their tables (paid users only)
    if (contentType === 'vendor') {
      const { data: connections } = await supabase
        .from('vendor_connections')
        .select('vendor_id, user_id')
        .gte('created_at', startDate)
        .lte('created_at', endDate)

      for (const conn of connections || []) {
        // Only count connections from paid users
        if (conn.vendor_id && conn.user_id && paidUserIds.has(conn.user_id) && contentMap.has(conn.vendor_id)) {
          contentMap.get(conn.vendor_id)!.connections_count++
        }
      }
    } else if (contentType === 'lender') {
      const { data: connections } = await supabase
        .from('lender_connections')
        .select('lender_id, user_id')
        .gte('created_at', startDate)
        .lte('created_at', endDate)

      for (const conn of connections || []) {
        // Only count connections from paid users
        if (conn.lender_id && conn.user_id && paidUserIds.has(conn.user_id) && contentMap.has(conn.lender_id)) {
          contentMap.get(conn.lender_id)!.connections_count++
        }
      }
    }

    // Convert to array and format
    const items = Array.from(contentMap.values()).map(item => ({
      content_id: item.content_id,
      content_title: item.content_title,
      views_count: item.views_count,
      connections_count: item.connections_count,
      unique_users: item.unique_users.size
    }))

    // Sort by views descending
    items.sort((a, b) => b.views_count - a.views_count)

    return NextResponse.json({ items })
  } catch (error: any) {
    console.error('Analytics content list error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch content analytics' },
      { status: 500 }
    )
  }
}
