'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { CreditCard, AlertCircle, X } from 'lucide-react'
import Link from 'next/link'
import { AddCardModal } from '@/components/modals/AddCardModal'
import { PurchaseEscalationsModal } from '@/components/modals/PurchaseEscalationsModal'
import { CancelPlanModal } from '@/components/modals/CancelPlanModal'
import { getImpersonationSettingsClient } from '@/lib/impersonation'

interface BillingTabProps {
  initialPlanTier: string
}

// Default escalations per tier (yearly allowance) - must match lib/escalations.ts
const TIER_DEFAULT_ESCALATIONS: Record<string, number | 'unlimited'> = {
  'VIP': 'unlimited',
  'VIP Processor': 6,
  'Elite': 6,
  'Elite Processor': 3,
  'Premium': 1,
  'Premium Processor': 1,
  'Premium Guest': 0,  // Free tier - no escalations
  'None': 0,
  'Pending Checkout': 0,
}

interface BillingInfo {
  subscription: {
    status: string
    currentPeriodEnd: number
    cancelAtPeriodEnd: boolean
    price: number
    billingInterval: string
    nextBillingDate: string
  } | null
  invoices: Array<{
    id: string
    description: string
    date: string
    amount: string
    status: string
    invoiceUrl?: string
  }>
}

export default function BillingTab({ initialPlanTier }: BillingTabProps) {
  const [planTier, setPlanTier] = useState(initialPlanTier)
  const [isLoading, setIsLoading] = useState(false)
  const [addCardOpen, setAddCardOpen] = useState(false)
  const [purchaseEscalationsOpen, setPurchaseEscalationsOpen] = useState(false)
  const [cancelPlanOpen, setCancelPlanOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<any>(null)
  const [loadingPaymentMethod, setLoadingPaymentMethod] = useState(true)
  const [escalationsRemaining, setEscalationsRemaining] = useState<number>(1)
  const [loadingEscalations, setLoadingEscalations] = useState(true)
  const [isViewAsMode, setIsViewAsMode] = useState(false)
  const [pendingPlanTier, setPendingPlanTier] = useState<string | null>(null)
  const [pendingPlanEffectiveDate, setPendingPlanEffectiveDate] = useState<string | null>(null)
  const [cancelingDowngrade, setCancelingDowngrade] = useState(false)
  const [billingInfo, setBillingInfo] = useState<BillingInfo | null>(null)
  const [loadingBillingInfo, setLoadingBillingInfo] = useState(true)
  const [isImpersonating, setIsImpersonating] = useState(false)
  const [impersonatedUserId, setImpersonatedUserId] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    let viewAsDetected = false
    let impersonationDetected = false

    // Check if in View As mode (role/tier simulation)
    const cookieValue = document.cookie
      .split('; ')
      .find(row => row.startsWith('viewAsSettings='))
      ?.split('=')[1]

    if (cookieValue) {
      try {
        const settings = JSON.parse(decodeURIComponent(cookieValue))
        if (settings?.isViewingAs) {
          viewAsDetected = true
          setIsViewAsMode(true)
          // Use tier defaults for View As mode - get tier from cookie settings
          const viewAsTier = settings.plan_tier || planTier
          setPlanTier(viewAsTier) // Update state to match View As tier
          const defaultEscalations = TIER_DEFAULT_ESCALATIONS[viewAsTier]
          if (defaultEscalations === 'unlimited') {
            setEscalationsRemaining(9999)
          } else {
            setEscalationsRemaining(defaultEscalations ?? 0)
          }
          setLoadingEscalations(false)
          setLoadingPaymentMethod(false)
          setLoadingBillingInfo(false)
        }
      } catch (e) {
        console.error('Error parsing viewAsSettings:', e)
      }
    }

    // Check if in Impersonation mode (specific user)
    const impersonationSettings = getImpersonationSettingsClient()
    if (impersonationSettings?.isImpersonating && impersonationSettings.impersonatedUserId) {
      impersonationDetected = true
      setIsImpersonating(true)
      setImpersonatedUserId(impersonationSettings.impersonatedUserId)
    }

    const success = searchParams.get('success')
    const planFromUrl = searchParams.get('plan')

    if (success === 'true' && planFromUrl) {
      refreshPlan()
    }

    // Only fetch real data if not in View As mode
    // For impersonation, we fetch real data but using the impersonated user's ID
    if (!viewAsDetected) {
      fetchPaymentMethod(impersonationDetected ? impersonationSettings?.impersonatedUserId : undefined)
      fetchEscalations(impersonationDetected ? impersonationSettings?.impersonatedUserId : undefined)
      fetchBillingInfo(impersonationDetected ? impersonationSettings?.impersonatedUserId : undefined)
    }
  }, [searchParams, planTier])

  const fetchPaymentMethod = async (userId?: string) => {
    setLoadingPaymentMethod(true)
    try {
      const url = userId
        ? `/api/stripe/payment-method?userId=${userId}`
        : '/api/stripe/payment-method'
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        setPaymentMethod(data.paymentMethod)
      }
    } catch (error) {
      console.error('Error fetching payment method:', error)
    } finally {
      setLoadingPaymentMethod(false)
    }
  }

  const fetchEscalations = async (userId?: string) => {
    setLoadingEscalations(true)
    try {
      // First, check if annual reset is needed (skip for impersonation)
      if (!userId) {
        const resetResponse = await fetch('/api/escalations/check-reset', {
          method: 'POST'
        })
      }

      // Fetch updated profile data
      const { data: { user } } = await supabase.auth.getUser()
      const effectiveUserId = userId || user?.id
      if (effectiveUserId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('escalations_remaining, plan_tier, pending_plan_tier, pending_plan_effective_date')
          .eq('id', effectiveUserId)
          .single()

        if (profile) {
          setEscalationsRemaining(profile.escalations_remaining || 0)
          setPlanTier(profile.plan_tier || 'None')
          setPendingPlanTier(profile.pending_plan_tier || null)
          setPendingPlanEffectiveDate(profile.pending_plan_effective_date || null)
        }
      }
    } catch (error) {
      console.error('Error fetching escalations:', error)
    } finally {
      setLoadingEscalations(false)
    }
  }

  const fetchBillingInfo = async (userId?: string) => {
    setLoadingBillingInfo(true)
    try {
      const url = userId
        ? `/api/stripe/billing-info?userId=${userId}`
        : '/api/stripe/billing-info'
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        setBillingInfo(data)
      }
    } catch (error) {
      console.error('Error fetching billing info:', error)
    } finally {
      setLoadingBillingInfo(false)
    }
  }

  const cancelPendingDowngrade = async () => {
    setCancelingDowngrade(true)
    try {
      const response = await fetch('/api/subscription/downgrade', {
        method: 'DELETE'
      })

      if (response.ok) {
        setPendingPlanTier(null)
        setPendingPlanEffectiveDate(null)
      } else {
        const data = await response.json()
        console.error('Failed to cancel downgrade:', data.error)
      }
    } catch (error) {
      console.error('Error canceling downgrade:', error)
    } finally {
      setCancelingDowngrade(false)
    }
  }

  const refreshPlan = async () => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('plan_tier')
          .eq('id', user.id)
          .single()

        if (profile) {
          setPlanTier(profile.plan_tier || 'None')
        }
      }
    } catch (error) {
      console.error('Error refreshing plan:', error)
    } finally {
      setIsLoading(false)
      router.replace('/dashboard/settings', { scroll: false })
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-8">
      {/* Membership Info Header */}
      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-6">Membership Info</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Plan Details */}
          <div className="border border-gray-200 rounded-lg p-6">
            <h4 className="text-2xl font-bold text-[#dd1969] mb-2">
              {planTier}
            </h4>
            <p className="text-lg font-semibold text-gray-900 mb-4">
              {loadingBillingInfo ? (
                'Loading...'
              ) : billingInfo?.subscription ? (
                `$${billingInfo.subscription.price.toFixed(2)} / ${billingInfo.subscription.billingInterval === 'year' ? 'Year' : 'Month'}`
              ) : (
                'No active subscription'
              )}
            </p>
            <p className="text-sm text-gray-600 mb-4">
              Next Billing Date: {loadingBillingInfo ? 'Loading...' : billingInfo?.subscription?.nextBillingDate || 'N/A'}
            </p>

            {/* Pending Downgrade Notice */}
            {pendingPlanTier && pendingPlanEffectiveDate && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-800">
                      Scheduled Plan Change
                    </p>
                    <p className="text-sm text-amber-700 mt-1">
                      Your plan will change to <span className="font-semibold">{pendingPlanTier}</span> on{' '}
                      <span className="font-semibold">
                        {new Date(pendingPlanEffectiveDate).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </span>
                    </p>
                    <button
                      onClick={cancelPendingDowngrade}
                      disabled={cancelingDowngrade}
                      className="mt-2 text-sm text-amber-800 hover:text-amber-900 underline font-medium disabled:opacity-50"
                    >
                      {cancelingDowngrade ? 'Canceling...' : 'Cancel this change'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <Link href="/dashboard/select-plan" className="block">
                <Button
                  className="w-full bg-[#25314e] hover:bg-[#1a233a] text-white font-semibold rounded-full"
                >
                  Change Renewal Plan
                </Button>
              </Link>
              {/* Only show Cancel button if user has active subscription and no pending cancellation */}
              {/* Wait for both billingInfo and escalations to load to prevent flicker */}
              {!loadingBillingInfo && !loadingEscalations && billingInfo?.subscription && !pendingPlanTier && planTier !== 'Canceled' && planTier !== 'None' && (
                <Button
                  onClick={() => setCancelPlanOpen(true)}
                  variant="outline"
                  className="w-full bg-[#dd1969] hover:bg-[#c01559] text-white border-0 font-semibold rounded-full"
                >
                  Cancel Plan
                </Button>
              )}
            </div>
          </div>

          {/* Escalations */}
          <div className="border border-gray-200 rounded-lg p-6 flex flex-col justify-between">
            <div>
              <h4 className="text-2xl font-bold text-gray-900 mb-2">
                Escalations
              </h4>
              <p className="text-sm text-gray-600 mb-6">
                Escalations Remaining: {loadingEscalations ? (
                  <span className="font-semibold">Loading...</span>
                ) : planTier === 'VIP' ? (
                  <span className="font-semibold text-[#dd1969]">Unlimited</span>
                ) : (
                  <span className="font-semibold text-[#dd1969]">{escalationsRemaining}</span>
                )}
              </p>
            </div>
            {planTier !== 'VIP' && (
              <Button
                onClick={() => setPurchaseEscalationsOpen(true)}
                className="w-full bg-[#dd1969] hover:bg-[#c01559] text-white font-semibold rounded-full"
              >
                Purchase Additional
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Payment Information */}
      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-4">Payment Information</h3>

        {loadingPaymentMethod ? (
          <div className="bg-gray-100 rounded-lg p-6 mb-4 min-w-[300px]">
            <p className="text-gray-500">Loading payment method...</p>
          </div>
        ) : paymentMethod ? (
          /* Credit Card Display - Proper card aspect ratio (16:10) */
          <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl shadow-lg text-white w-full max-w-[400px] aspect-[16/10] p-6 flex flex-col justify-between mb-4">
            <div className="flex items-start justify-between">
              <CreditCard className="w-10 h-10" />
              <span className="text-xs opacity-75 bg-white/20 px-2 py-1 rounded">Default</span>
            </div>
            <div className="space-y-3">
              <div>
                <p className="font-mono text-xl tracking-wider">•••• •••• •••• {paymentMethod.last4}</p>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs opacity-75 mb-1">{paymentMethod.brand}</p>
                  <p className="font-semibold">{paymentMethod.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs opacity-75 mb-1">Expires</p>
                  <p className="font-semibold">{String(paymentMethod.expMonth).padStart(2, '0')}/{paymentMethod.expYear % 100}</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* No Card State */
          <div className="border-2 border-dashed border-gray-300 rounded-xl w-full max-w-[400px] aspect-[16/10] p-6 flex items-center justify-center mb-4">
            <div className="flex flex-col items-center gap-3 text-gray-500 text-center">
              <CreditCard className="w-12 h-12 opacity-50" />
              <div>
                <p className="font-semibold text-gray-700">No payment method on file</p>
                <p className="text-sm">Add a card to manage your subscription</p>
              </div>
            </div>
          </div>
        )}

        <div>
          <Button
            onClick={() => setAddCardOpen(true)}
            className="bg-[#dd1969] hover:bg-[#c01559] text-white font-semibold rounded-full"
          >
            {paymentMethod ? 'Update Card' : 'Add Card'}
          </Button>
        </div>
      </div>

      {/* Payment History */}
      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-4">Payment History</h3>

        <div className="space-y-4">
          {loadingBillingInfo ? (
            <p className="text-gray-500">Loading payment history...</p>
          ) : billingInfo?.invoices && billingInfo.invoices.length > 0 ? (
            billingInfo.invoices.map((payment) => (
              <div key={payment.id} className="border-b border-gray-200 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-semibold text-gray-900">Invoice #{payment.id}</p>
                    <p className="text-sm text-gray-600">{payment.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-900">{payment.amount}</span>
                    <span className="text-sm text-gray-500">{payment.date}</span>
                    <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                      {payment.status}
                    </span>
                    {payment.invoiceUrl && (
                      <a
                        href={payment.invoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[#dd1969] hover:underline"
                      >
                        View
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-500">No payment history available</p>
          )}
        </div>
      </div>

      {/* Modals */}
      <AddCardModal
        open={addCardOpen}
        onOpenChange={setAddCardOpen}
        onSuccess={() => {
          // Refresh payment method data
          fetchPaymentMethod()
        }}
      />
      <PurchaseEscalationsModal
        open={purchaseEscalationsOpen}
        onOpenChange={setPurchaseEscalationsOpen}
        onSuccess={() => {
          // Refresh escalations count
          fetchEscalations()
        }}
      />
      <CancelPlanModal
        open={cancelPlanOpen}
        onOpenChange={setCancelPlanOpen}
        planName={planTier}
        cancelDate={billingInfo?.subscription?.nextBillingDate || 'your next billing date'}
        onSuccess={() => {
          // Refresh billing info and escalations to show cancellation pending status
          fetchBillingInfo()
          fetchEscalations() // This updates pendingPlanTier and pendingPlanEffectiveDate
        }}
      />
    </div>
  )
}
