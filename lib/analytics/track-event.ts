'use client'

import { createClient } from '@/lib/supabase/client'

export type EventType = 'view' | 'click' | 'download' | 'contact' | 'registration' | 'calendar_add' | 'share' | 'bookmark' | 'play' | 'complete'
export type ContentType = 'resource' | 'vendor' | 'lender' | 'event'

interface TrackEventParams {
  eventType: EventType
  contentType: ContentType
  contentId: string
  contentTitle?: string
  metadata?: Record<string, any>
}

// Debounce to prevent duplicate events
const recentEvents = new Set<string>()
const EVENT_DEBOUNCE_MS = 5000 // 5 seconds

export async function trackEvent({
  eventType,
  contentType,
  contentId,
  contentTitle,
  metadata = {}
}: TrackEventParams) {
  // Create unique event key
  const eventKey = `${eventType}-${contentType}-${contentId}`

  // Check if this event was recently tracked
  if (recentEvents.has(eventKey)) {
    return
  }

  // Add to recent events and schedule removal
  recentEvents.add(eventKey)
  setTimeout(() => recentEvents.delete(eventKey), EVENT_DEBOUNCE_MS)

  try {
    const supabase = createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()

    // Get session ID from localStorage or create new one
    let sessionId = localStorage.getItem('analytics_session_id')
    if (!sessionId) {
      sessionId = crypto.randomUUID()
      localStorage.setItem('analytics_session_id', sessionId)
    }

    // Get user context if authenticated
    let userPlanTier = null
    let userRole = null

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan_tier, role, is_admin')
        .eq('id', user.id)
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

    // Track the event
    await supabase.from('analytics_events').insert({
      user_id: user?.id || null,
      session_id: sessionId,
      event_type: eventType,
      event_category: contentType,
      content_type: contentType,
      content_id: contentId,
      content_title: contentTitle,
      user_plan_tier: userPlanTier,
      user_role: userRole,
      metadata,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent
    })

  } catch (error) {
    // Silent fail - don't break user experience if tracking fails
    console.error('Analytics tracking error:', error)
  }
}

// Hook for React components
export function useAnalytics() {
  return { trackEvent }
}
