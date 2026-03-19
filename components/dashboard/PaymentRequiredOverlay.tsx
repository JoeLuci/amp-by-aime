'use client'

import { AlertTriangle, CreditCard, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

interface PaymentRequiredOverlayProps {
  children: React.ReactNode
  paymentFailedAt: string | null
  subscriptionStatus?: string
  gracePeriodDays?: number
}

/**
 * Overlay component that blocks access to content when payment grace period has expired.
 * Wraps premium content and shows a payment required message when access is restricted.
 */
export function PaymentRequiredOverlay({
  children,
  paymentFailedAt,
  subscriptionStatus,
  gracePeriodDays = 7,
}: PaymentRequiredOverlayProps) {
  // If no payment failure or subscription is active, show content normally
  if (!paymentFailedAt || subscriptionStatus === 'active') {
    return <>{children}</>
  }

  // Calculate if grace period has expired
  const failedDate = new Date(paymentFailedAt)
  const now = new Date()
  const daysSinceFailure = Math.floor(
    (now.getTime() - failedDate.getTime()) / (1000 * 60 * 60 * 24)
  )
  const gracePeriodExpired = daysSinceFailure >= gracePeriodDays

  // If still in grace period, show content with warning
  if (!gracePeriodExpired) {
    return <>{children}</>
  }

  // Grace period expired - block access
  return (
    <div className="relative">
      {/* Blurred content behind */}
      <div className="blur-sm pointer-events-none select-none opacity-50">
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm">
        <div className="max-w-md text-center p-8">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Access Restricted
          </h2>
          <p className="text-gray-600 mb-6">
            Your subscription payment has failed and the grace period has
            expired. Please update your payment method to restore access to
            premium content.
          </p>
          <Button asChild variant="destructive" size="lg">
            <Link href="/dashboard/settings?tab=billing">
              <CreditCard className="w-5 h-5 mr-2" />
              Update Payment Method
            </Link>
          </Button>
          <p className="mt-4 text-sm text-gray-500">
            Need help?{' '}
            <Link
              href="/dashboard/support"
              className="text-blue-600 hover:underline"
            >
              Contact Support
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Hook-friendly function to check if content should be blocked
 */
export function shouldBlockContent(
  paymentFailedAt: string | null,
  subscriptionStatus?: string,
  gracePeriodDays: number = 7
): boolean {
  if (!paymentFailedAt || subscriptionStatus === 'active') {
    return false
  }

  const failedDate = new Date(paymentFailedAt)
  const now = new Date()
  const daysSinceFailure = Math.floor(
    (now.getTime() - failedDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  return daysSinceFailure >= gracePeriodDays
}
