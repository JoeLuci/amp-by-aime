import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin access
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // Get conversion summary counts
    const { data: summaryData } = await supabase
      .from('conversion_attributions')
      .select('conversion_type')
      .gte('conversion_date', startDate)
      .lte('conversion_date', endDate)

    const summary = {
      upgrades: summaryData?.filter(c => c.conversion_type === 'upgrade').length || 0,
      downgrades: summaryData?.filter(c => c.conversion_type === 'downgrade').length || 0,
      cancellations: summaryData?.filter(c => c.conversion_type === 'cancellation').length || 0,
      signups: summaryData?.filter(c => c.conversion_type === 'signup').length || 0,
    }

    // Get recent conversions with user details
    const { data: conversions } = await supabase
      .from('conversion_attributions')
      .select(`
        id,
        conversion_type,
        from_tier,
        to_tier,
        conversion_date,
        user_id,
        profiles!inner(email, full_name)
      `)
      .gte('conversion_date', startDate)
      .lte('conversion_date', endDate)
      .order('conversion_date', { ascending: false })
      .limit(100)

    return NextResponse.json({
      summary,
      conversions: conversions?.map(c => ({
        ...c,
        email: (c.profiles as any)?.email,
        full_name: (c.profiles as any)?.full_name,
      })) || []
    })
  } catch (error: any) {
    console.error('Error fetching conversion analytics:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch conversion analytics' },
      { status: 500 }
    )
  }
}
