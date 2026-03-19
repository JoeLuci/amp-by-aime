'use client'

import { AlertTriangle, CreditCard, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useState } from 'react'

interface PaymentFailedBannerProps {
  paymentFailedAt: string | null
  subscriptionStatus?: string
  gracePeriodDays?: number
}

export function PaymentFailedBanner({
  paymentFailedAt,
  subscriptionStatus,
  gracePeriodDays = 7,
}: PaymentFailedBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  // Don't show if no payment failure or if subscription is active
  if (!paymentFailedAt || subscriptionStatus === 'active' || dismissed) {
    return null
  }

  const failedDate = new Date(paymentFailedAt)
  const now = new Date()
  const daysSinceFailure = Math.floor(
    (now.getTime() - failedDate.getTime()) / (1000 * 60 * 60 * 24)
  )
  const daysRemaining = Math.max(0, gracePeriodDays - daysSinceFailure)
  const isGracePeriodExpired = daysRemaining === 0

  // Determine urgency level
  const isUrgent = daysRemaining <= 2
  const isCritical = isGracePeriodExpired

  return (
    <div
      className={`relative mb-4 rounded-lg border p-4 ${
        isCritical
          ? 'bg-red-50 border-red-300 text-red-900'
          : isUrgent
          ? 'bg-orange-50 border-orange-300 text-orange-900'
          : 'bg-yellow-50 border-yellow-300 text-yellow-900'
      }`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
            isCritical
              ? 'text-red-600'
              : isUrgent
              ? 'text-orange-600'
              : 'text-yellow-600'
          }`}
        />
        <div className="flex-1">
          <h3 className="font-semibold">
            {isCritical
              ? 'Account Access Restricted - Payment Required'
              : isUrgent
              ? 'Urgent: Payment Failed'
              : 'Payment Failed'}
          </h3>
          <p className="mt-1 text-sm">
            {isCritical ? (
              <>
                Your subscription payment has failed and the grace period has
                expired. Please update your payment method to restore full
                access to your account.
              </>
            ) : (
              <>
                We were unable to process your subscription payment. Please
                update your payment method within{' '}
                <strong>
                  {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}
                </strong>{' '}
                to avoid any interruption to your service.
              </>
            )}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <Button
              asChild
              size="sm"
              variant={isCritical ? 'destructive' : 'default'}
            >
              <Link href="/dashboard/settings?tab=billing">
                <CreditCard className="h-4 w-4 mr-2" />
                Update Payment Method
              </Link>
            </Button>
            {!isCritical && (
              <button
                onClick={() => setDismissed(true)}
                className="text-sm underline opacity-70 hover:opacity-100"
              >
                Remind me later
              </button>
            )}
          </div>
        </div>
        {!isCritical && (
          <button
            onClick={() => setDismissed(true)}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

// Utility function to check if user's grace period has expired
export function isGracePeriodExpired(
  paymentFailedAt: string | null,
  gracePeriodDays: number = 7
): boolean {
  if (!paymentFailedAt) return false

  const failedDate = new Date(paymentFailedAt)
  const now = new Date()
  const daysSinceFailure = Math.floor(
    (now.getTime() - failedDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  return daysSinceFailure >= gracePeriodDays
}

// Utility function to get days remaining in grace period
export function getGracePeriodDaysRemaining(
  paymentFailedAt: string | null,
  gracePeriodDays: number = 7
): number {
  if (!paymentFailedAt) return gracePeriodDays

  const failedDate = new Date(paymentFailedAt)
  const now = new Date()
  const daysSinceFailure = Math.floor(
    (now.getTime() - failedDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  return Math.max(0, gracePeriodDays - daysSinceFailure)
}
