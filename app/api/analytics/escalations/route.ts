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

    // Get date range params
    const startDate = searchParams.get('startDate') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const endDate = searchParams.get('endDate') || new Date().toISOString()

    // Fetch loan escalations (handle gracefully if table doesn't exist)
    let escalations: any[] = []
    try {
      const { data, error } = await supabase
        .from('loan_escalations')
        .select('id, originator_full_name, partner_name, issue_type, user_status, created_at')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false })

      if (!error) {
        escalations = data || []
      } else {
        console.error('Error fetching escalations:', error)
      }
    } catch (err) {
      console.error('Escalations table may not exist:', err)
    }

    // Fetch change AE requests (handle gracefully if table doesn't exist)
    let changeAERequests: any[] = []
    try {
      const { data, error } = await supabase
        .from('change_ae_requests')
        .select('id, user_full_name, lender_name, issue_type, user_status, created_at')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false })

      if (!error) {
        changeAERequests = data || []
      } else {
        console.error('Error fetching change AE requests:', error)
      }
    } catch (err) {
      console.error('Change AE requests table may not exist:', err)
    }

    return NextResponse.json({
      escalations,
      changeAERequests
    })
  } catch (error: any) {
    console.error('Analytics escalations error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch escalations data' },
      { status: 500 }
    )
  }
}
