import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface Params {
  contentType: string
  contentId: string
}

export async function GET(
  request: Request,
  context: { params: Promise<Params> }
) {
  const { contentType, contentId } = await context.params

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

    // Get date range and grouping
    const startDate = searchParams.get('startDate') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const endDate = searchParams.get('endDate') || new Date().toISOString()
    const groupBy = searchParams.get('groupBy') || 'day' // day, week, month

    // Get content analytics
    const { data: analytics, error } = await supabase
      .rpc('get_content_analytics', {
        p_content_type: contentType,
        p_content_id: contentId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_group_by: groupBy
      })

    if (error) {
      console.error('Error fetching content analytics:', error)
      throw error
    }

    return NextResponse.json({ analytics: analytics || [] })
  } catch (error: any) {
    console.error('Content analytics error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to retrieve analytics' },
      { status: 500 }
    )
  }
}
