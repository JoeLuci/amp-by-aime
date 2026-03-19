import { createClient } from '@/lib/supabase/server'

export async function trackEventServer({
  userId,
  eventType,
  contentType,
  contentId,
  contentTitle,
  metadata = {}
}: {
  userId?: string
  eventType: string
  contentType: string
  contentId: string
  contentTitle?: string
  metadata?: Record<string, any>
}) {
  try {
    const supabase = await createClient()

    // Get user context if userId provided
    let userPlanTier = null
    let userRole = null

    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan_tier, role, is_admin')
        .eq('id', userId)
        .single()

      if (profile) {
        // Skip tracking for admin users to avoid skewing analytics
        if (profile.is_admin) {
          return
        }
        userPlanTier = profile.plan_tier
        userRole = profile.role
      }
    }

    await supabase.from('analytics_events').insert({
      user_id: userId || null,
      event_type: eventType,
      event_category: contentType,
      content_type: contentType,
      content_id: contentId,
      content_title: contentTitle,
      user_plan_tier: userPlanTier,
      user_role: userRole,
      metadata
    })
  } catch (error) {
    console.error('Server analytics tracking error:', error)
  }
}
