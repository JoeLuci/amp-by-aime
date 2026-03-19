'use client'

import { useEffect, useRef } from 'react'
import { trackEvent, ContentType } from '@/lib/analytics/track-event'

interface ViewTrackerProps {
  contentType: ContentType
  contentId: string
  contentTitle?: string
  threshold?: number // Percentage of element visible to count as view (0-1)
  minDuration?: number // Minimum milliseconds visible to count
}

export function ViewTracker({
  contentType,
  contentId,
  contentTitle,
  threshold = 0.5,
  minDuration = 2000
}: ViewTrackerProps) {
  const hasTracked = useRef(false)
  const visibilityStart = useRef<number | null>(null)

  useEffect(() => {
    if (hasTracked.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= threshold) {
            // Element is visible
            if (!visibilityStart.current) {
              visibilityStart.current = Date.now()
            }

            // Check if visible for minimum duration
            setTimeout(() => {
              if (visibilityStart.current && !hasTracked.current) {
                const duration = Date.now() - visibilityStart.current
                if (duration >= minDuration) {
                  trackEvent({
                    eventType: 'view',
                    contentType,
                    contentId,
                    contentTitle,
                    metadata: { viewDuration: duration }
                  })
                  hasTracked.current = true
                }
              }
            }, minDuration)
          } else {
            // Element not visible, reset timer
            visibilityStart.current = null
          }
        })
      },
      { threshold }
    )

    // Observe the document body (component always in view)
    observer.observe(document.body)

    return () => observer.disconnect()
  }, [contentType, contentId, contentTitle, threshold, minDuration])

  return null // This component doesn't render anything
}
