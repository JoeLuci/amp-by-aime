/**
 * Helper functions for managing escalations
 */

/**
 * Get the base escalation count for a plan tier
 */
export function getBasePlanEscalations(planTier: string): number {
  const escalationsMap: Record<string, number> = {
    'Premium': 1,
    'Premium Processor': 1,
    'Premium Guest': 0,
    'Elite': 6,
    'Elite Processor': 3,
    'VIP': 9999, // Unlimited
    'VIP Processor': 6,
    'None': 0,
    'Pending Checkout': 0
  }

  return escalationsMap[planTier] || 0
}

/**
 * Check if escalations need to be reset (annual reset)
 * Returns true if it's been more than a year since last reset
 */
export function shouldResetEscalations(lastResetDate: string | null): boolean {
  if (!lastResetDate) return true

  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  const lastReset = new Date(lastResetDate)
  return lastReset <= oneYearAgo
}
