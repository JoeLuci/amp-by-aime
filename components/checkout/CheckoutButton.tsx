'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface CheckoutButtonProps {
  planId: string
  planName: string
  currentPlan: string
  billingInterval: 'monthly' | 'annual'
  className?: string
  hasActiveSubscription?: boolean // If user already has a Stripe subscription
}

// Plan tier hierarchy for comparison (must match API)
const PLAN_HIERARCHY: Record<string, number> = {
  'None': 0,
  'Pending Checkout': 0,
  'Premium Guest': 0,
  'Premium': 1,
  'Premium Processor': 1,
  'Elite': 2,
  'Elite Processor': 2,
  'VIP': 3,
  'VIP Processor': 3,
}

export default function CheckoutButton({
  planId,
  planName,
  currentPlan,
  billingInterval,
  className,
  hasActiveSubscription = false,
}: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const router = useRouter()

  const handleCheckout = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ planId, billingInterval }),
      })

      const data = await response.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        console.error('No checkout URL returned')
        setLoading(false)
      }
    } catch (error) {
      console.error('Checkout error:', error)
      setLoading(false)
    }
  }

  const handleUpgrade = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const response = await fetch('/api/subscription/upgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetPlanTier: planName,
          billingInterval
        }),
      })

      const data = await response.json()

      if (data.success) {
        setMessage(data.message)
        // Refresh the page to show updated plan
        setTimeout(() => {
          router.refresh()
          window.location.reload()
        }, 1500)
      } else {
        setMessage(data.error || 'Failed to upgrade')
        setLoading(false)
      }
    } catch (error) {
      console.error('Upgrade error:', error)
      setMessage('Failed to process upgrade')
      setLoading(false)
    }
  }

  const handleDowngrade = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const response = await fetch('/api/subscription/downgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetPlanTier: planName,
          billingInterval
        }),
      })

      const data = await response.json()

      if (data.success) {
        setMessage(data.message)
        // Refresh the page after a short delay to show updated status
        setTimeout(() => {
          router.refresh()
        }, 2000)
      } else {
        setMessage(data.error || 'Failed to schedule downgrade')
      }
    } catch (error) {
      console.error('Downgrade error:', error)
      setMessage('Failed to schedule downgrade')
    } finally {
      setLoading(false)
    }
  }

  const isCurrentPlan = currentPlan === planName
  const isPremiumGuestPlan = planId === 'premium-guest' || planName === 'Premium Guest'

  // Determine if this is an upgrade or downgrade
  const currentTier = PLAN_HIERARCHY[currentPlan as keyof typeof PLAN_HIERARCHY] || 0
  const targetTier = PLAN_HIERARCHY[planName as keyof typeof PLAN_HIERARCHY] || 0
  const isUpgrade = targetTier > currentTier
  const isDowngrade = targetTier < currentTier

  // Show "Current Plan" button for current plan
  if (isCurrentPlan) {
    return (
      <Button className={className} disabled>
        Current Plan
      </Button>
    )
  }

  // Disable Premium Guest plan - it's trial only, cannot be purchased
  if (isPremiumGuestPlan) {
    return (
      <Button className="w-full bg-gray-300 text-gray-500 cursor-not-allowed font-semibold" disabled>
        Trial Only
      </Button>
    )
  }

  // Downgrade button - schedules change for end of billing period
  // Only show if user has an active subscription (can't downgrade without one)
  if (isDowngrade && hasActiveSubscription) {
    return (
      <div className="space-y-2">
        <Button
          onClick={handleDowngrade}
          disabled={loading}
          className="w-full bg-gray-500 hover:bg-gray-600 text-white font-semibold"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            `Downgrade to ${planName}`
          )}
        </Button>
        {message && (
          <p className={`text-sm text-center ${message.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
            {message}
          </p>
        )}
        <p className="text-xs text-gray-500 text-center">
          Your current plan continues until the end of your billing period
        </p>
      </div>
    )
  }

  // If it's a downgrade but no subscription, show disabled (shouldn't happen normally)
  if (isDowngrade && !hasActiveSubscription) {
    return (
      <Button className={className} disabled>
        {planName}
      </Button>
    )
  }

  // Upgrade button - use API if already subscribed, otherwise checkout
  if (hasActiveSubscription) {
    return (
      <div className="space-y-2">
        <Button
          onClick={handleUpgrade}
          disabled={loading}
          className={className}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            `Upgrade to ${planName}`
          )}
        </Button>
        {message && (
          <p className={`text-sm text-center ${message.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
            {message}
          </p>
        )}
        <p className="text-xs text-gray-500 text-center">
          You&apos;ll be charged the prorated difference immediately
        </p>
      </div>
    )
  }

  // New subscription checkout (no existing subscription)
  return (
    <Button
      onClick={handleCheckout}
      disabled={loading}
      className={className}
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Processing...
        </>
      ) : (
        `Get ${planName}`
      )}
    </Button>
  )
}
