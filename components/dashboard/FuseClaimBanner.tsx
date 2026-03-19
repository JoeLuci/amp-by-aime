'use client'

import { X, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import Link from 'next/link'
import type { PlanTier } from '@/types/database.types'

interface FuseClaimBannerProps {
  planTier?: PlanTier | string | null
  fuseTicketClaimedYear?: number | null
  activeEventYear?: number
  eventName?: string
  eventLocation?: string
  /** Only show banner when admin is previewing (View As / Impersonation) */
  isAdminPreview?: boolean
  /** Show banner for admin users directly */
  isAdmin?: boolean
}

// Map plan tiers to their included tickets
const TIER_ENTITLEMENTS: Record<string, string> = {
  Premium: '1 GA ticket included',
  Elite: '1 GA ticket included',
  VIP: '1 VIP + 1 Guest ticket included',
}

export function FuseClaimBanner({
  planTier,
  fuseTicketClaimedYear,
  activeEventYear = 2026,
  eventName,
  eventLocation,
  isAdminPreview = false,
  isAdmin = false,
}: FuseClaimBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  // Show for admin users or admin preview mode
  const canSeeBanner = isAdmin || isAdminPreview

  if (!canSeeBanner) {
    return null
  }

  // Don't show if dismissed
  if (dismissed) {
    return null
  }

  // For non-admin users, require eligible tier; admins always see the banner
  if (!isAdmin && (!planTier || !TIER_ENTITLEMENTS[planTier])) {
    return null
  }

  // Don't show if already claimed for this year
  if (fuseTicketClaimedYear === activeEventYear) {
    return null
  }

  const entitlement = isAdmin && (!planTier || !TIER_ENTITLEMENTS[planTier])
    ? 'Admin test registration'
    : TIER_ENTITLEMENTS[planTier!]
  const displayName = eventName || `Fuse ${activeEventYear}`

  return (
    <div className="relative overflow-hidden">
      {/* Dark wood-tone background with warm gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, #1a1008 0%, #2a1d12 40%, #3a2818 70%, #2a1d12 100%)',
        }}
      />
      {/* Subtle gold accent line at top */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{
          background: 'linear-gradient(90deg, transparent, #c8943a, #e0a040, #c8943a, transparent)',
        }}
      />

      {/* Content */}
      <div className="relative px-4 md:px-6 lg:px-8 py-3">
        <div className="flex items-center gap-3">
          {/* Fuse logo mini */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/fuse/fuse-logo.png"
            alt=""
            className="h-8 w-auto flex-shrink-0"
            style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.5))' }}
          />

          {/* Event info */}
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="font-bold text-sm whitespace-nowrap"
              style={{ color: '#e8d5b0' }}
            >
              {displayName}
            </span>
            {eventLocation && (
              <span
                className="hidden sm:flex items-center gap-1 text-sm"
                style={{ color: '#a08860' }}
              >
                <span style={{ color: '#c8943a' }}>&#9679;</span>
                Austin, TX
              </span>
            )}
            <span className="hidden md:inline" style={{ color: '#5a4020' }}>|</span>
            <span
              className="text-sm hidden md:inline"
              style={{ color: '#c8a050' }}
            >
              {entitlement}
            </span>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* CTA */}
          <Link
            href="/dashboard/fuse-registration"
            className="flex items-center gap-1 font-semibold text-sm px-4 py-1.5 rounded transition-all whitespace-nowrap"
            style={{
              background: 'linear-gradient(135deg, #8a4a10, #a86018, #c87828)',
              color: '#f8e8c8',
              border: '1px solid #6a3a08',
              textShadow: '0 1px 2px rgba(0,0,0,0.3)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
            }}
          >
            Claim Your Ticket
            <ChevronRight className="h-4 w-4" />
          </Link>

          {/* Dismiss */}
          <button
            onClick={() => setDismissed(true)}
            className="transition-colors"
            style={{ color: '#6a5030' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#c8a050')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#6a5030')}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
