import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const {
      eventType,
      contentType,
      contentId,
      contentTitle,
      metadata
    } = body

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()

    // Get user context
    let userPlanTier = null
    let userRole = null

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan_tier, role')
        .eq('id', user.id)
        .single()

      if (profile) {
        userPlanTier = profile.plan_tier
        userRole = profile.role

        // Don't track analytics for vendor/lender partners - only paid members
        if (profile.role === 'partner_vendor' || profile.role === 'partner_lender') {
          return NextResponse.json({ success: true, skipped: true })
        }
      }
    }

    // Insert event
    const { error } = await supabase.from('analytics_events').insert({
      user_id: user?.id || null,
      event_type: eventType,
      event_category: contentType,
      content_type: contentType,
      content_id: contentId,
      content_title: contentTitle,
      user_plan_tier: userPlanTier,
      user_role: userRole,
      metadata: metadata || {}
    })

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Analytics tracking error:', error)
    return NextResponse.json(
      { error: 'Failed to track event' },
      { status: 500 }
    )
  }
}
