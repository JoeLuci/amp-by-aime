/**
 * Subscription Access Utilities
 *
 * Handles grace period logic and access restrictions for failed payments.
 * Grace period: 7 days from first payment failure before access is restricted.
 */

const GRACE_PERIOD_DAYS = 7

export interface SubscriptionAccessInfo {
  hasAccess: boolean
  isInGracePeriod: boolean
  gracePeriodExpired: boolean
  daysRemaining: number
  paymentFailed: boolean
  subscriptionStatus: string | null
}

/**
 * Check if user has premium access based on subscription status and payment failure
 */
export function checkSubscriptionAccess(
  paymentFailedAt: string | null | undefined,
  subscriptionStatus: string | null | undefined,
  planTier: string | null | undefined
): SubscriptionAccessInfo {
  // If no payment failure, user has full access
  if (!paymentFailedAt) {
    return {
      hasAccess: true,
      isInGracePeriod: false,
      gracePeriodExpired: false,
      daysRemaining: GRACE_PERIOD_DAYS,
      paymentFailed: false,
      subscriptionStatus: subscriptionStatus || null,
    }
  }

  // If subscription is active (payment recovered), user has full access
  if (subscriptionStatus === 'active') {
    return {
      hasAccess: true,
      isInGracePeriod: false,
      gracePeriodExpired: false,
      daysRemaining: GRACE_PERIOD_DAYS,
      paymentFailed: false,
      subscriptionStatus: subscriptionStatus,
    }
  }

  // Calculate days since payment failure
  const failedDate = new Date(paymentFailedAt)
  const now = new Date()
  const daysSinceFailure = Math.floor(
    (now.getTime() - failedDate.getTime()) / (1000 * 60 * 60 * 24)
  )
  const daysRemaining = Math.max(0, GRACE_PERIOD_DAYS - daysSinceFailure)
  const gracePeriodExpired = daysRemaining === 0

  return {
    // User still has access during grace period
    hasAccess: !gracePeriodExpired,
    isInGracePeriod: !gracePeriodExpired,
    gracePeriodExpired,
    daysRemaining,
    paymentFailed: true,
    subscriptionStatus: subscriptionStatus || null,
  }
}

/**
 * Check if a specific feature should be accessible based on plan tier and payment status
 *
 * @param requiredTiers - Array of plan tiers that have access to this feature
 * @param userTier - User's current plan tier
 * @param paymentFailedAt - When payment first failed (null if no failure)
 * @param subscriptionStatus - Current subscription status
 */
export function hasFeatureAccess(
  requiredTiers: string[],
  userTier: string | null | undefined,
  paymentFailedAt: string | null | undefined,
  subscriptionStatus: string | null | undefined
): boolean {
  // Check if user's plan tier includes access to this feature
  if (!userTier || !requiredTiers.includes(userTier)) {
    return false
  }

  // Check if payment failure has caused access restriction
  const accessInfo = checkSubscriptionAccess(
    paymentFailedAt,
    subscriptionStatus,
    userTier
  )

  return accessInfo.hasAccess
}

/**
 * Get a user-friendly message about their access status
 */
export function getAccessStatusMessage(
  accessInfo: SubscriptionAccessInfo
): string | null {
  if (!accessInfo.paymentFailed) {
    return null
  }

  if (accessInfo.gracePeriodExpired) {
    return 'Your subscription access has been suspended due to payment failure. Please update your payment method to restore access.'
  }

  if (accessInfo.daysRemaining === 1) {
    return 'Your payment has failed. Please update your payment method within 1 day to avoid losing access.'
  }

  return `Your payment has failed. Please update your payment method within ${accessInfo.daysRemaining} days to avoid losing access.`
}

/**
 * Server-side utility to check access in API routes
 */
export function checkServerSideAccess(profile: {
  payment_failed_at?: string | null
  stripe_subscription_status?: string | null
  plan_tier?: string | null
}): SubscriptionAccessInfo {
  return checkSubscriptionAccess(
    profile.payment_failed_at,
    profile.stripe_subscription_status,
    profile.plan_tier
  )
}
