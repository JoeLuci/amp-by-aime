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

    // Get date range from query params
    const startDate = searchParams.get('startDate') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const endDate = searchParams.get('endDate') || new Date().toISOString()

    // Get dashboard metrics using stored function
    const { data: metrics, error: metricsError } = await supabase
      .rpc('get_admin_dashboard_metrics', {
        p_start_date: startDate,
        p_end_date: endDate
      })

    if (metricsError) {
      console.error('Error fetching dashboard metrics:', metricsError)
      throw metricsError
    }

    // Get conversion funnel data
    const { data: conversions, error: conversionsError } = await supabase
      .rpc('get_conversion_funnel', {
        p_start_date: startDate,
        p_end_date: endDate
      })

    if (conversionsError) {
      console.error('Error fetching conversion data:', conversionsError)
    }

    return NextResponse.json({
      metrics: metrics?.[0] || {},
      conversions: conversions || []
    })
  } catch (error: any) {
    console.error('Analytics dashboard error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}
