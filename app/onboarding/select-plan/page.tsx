'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Check, Loader2, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  standardPlans,
  processorPlans,
  standardFeatures,
  standardFeatureMatrix,
  processorFeatures,
  processorFeatureMatrix,
} from '@/lib/plans'

export default function OnboardingSelectPlanPage() {
  const router = useRouter()
  const supabase = createClient()
  const [isProcessor, setIsProcessor] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [isAnnual, setIsAnnual] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    async function loadUserData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/sign-in')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, onboarding_step, subscription_status, plan_tier')
        .eq('id', user.id)
        .single()

      if (profile) {
        // Check if role is processor to determine which plans to show
        setIsProcessor(profile.role === 'processor')

        // Check if user has active subscription
        const hasActiveSubscription = profile.subscription_status === 'active' ||
          profile.subscription_status === 'trialing'
        const hasPaidPlan = profile.plan_tier &&
          profile.plan_tier !== 'None' &&
          profile.plan_tier !== 'Pending Checkout'

        // Only redirect to dashboard if completed onboarding AND has active subscription
        if (profile.onboarding_step === 'completed' && hasActiveSubscription && hasPaidPlan) {
          router.push('/dashboard')
          return
        }
      }

      setIsLoading(false)
    }

    loadUserData()
  }, [])

  const plans = isProcessor ? processorPlans : standardPlans

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/sign-in')
  }

  const handleSelectPlan = async (planId: string) => {
    setSelectedPlan(planId)
    setIsSubmitting(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Update onboarding step before redirecting to checkout
      await supabase
        .from('profiles')
        .update({
          onboarding_step: 'complete_profile',
        })
        .eq('id', user.id)

      // All plans (including Free Trial) go through Stripe checkout
      // Create checkout session
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planId,
          billingInterval: isAnnual ? 'annual' : 'monthly',
          userId: user.id,
          returnUrl: '/onboarding/complete-profile',
        }),
      })

      if (!response.ok) {
        console.error('Checkout failed with status:', response.status, response.statusText)
        let errorMessage = 'Failed to create checkout session'
        try {
          const error = await response.json()
          console.error('Checkout error response:', error)
          errorMessage = error.error || errorMessage
        } catch (e) {
          console.error('Failed to parse error response')
        }
        toast.error(errorMessage)
        setIsSubmitting(false)
        return
      }

      const { url } = await response.json()
      if (url) {
        window.location.href = url
      } else {
        toast.error('No checkout URL returned')
        setIsSubmitting(false)
      }
    } catch (error: any) {
      console.error('Error selecting plan:', error)
      toast.error(error.message || 'An unexpected error occurred')
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#20adce] via-[#1a8ba8] to-[#25314e] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#20adce] via-[#1a8ba8] to-[#25314e]">
      {/* Logout Button */}
      <div className="absolute top-4 right-4 md:top-8 md:right-8">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>

      <div className="px-4 md:px-8 py-8 md:py-12">
        <div className="text-center text-white mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Choose Your Plan
          </h1>
          <p className="text-lg md:text-xl text-white/90 max-w-2xl mx-auto">
            {isProcessor ? 'Special processor pricing and benefits' : 'Select the perfect plan to unlock your full potential'}
          </p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4 mt-6">
            <span className={`text-sm font-medium ${!isAnnual ? 'text-white' : 'text-white/70'}`}>
              Monthly
            </span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className="relative inline-flex h-8 w-14 items-center rounded-full bg-white/20 transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#20adce]"
            >
              <span
                className={`${
                  isAnnual ? 'translate-x-7' : 'translate-x-1'
                } inline-block h-6 w-6 transform rounded-full bg-white transition-transform`}
              />
            </button>
            <span className={`text-sm font-medium ${isAnnual ? 'text-white' : 'text-white/70'}`}>
              Annual
            </span>
            {isAnnual && (
              <span className="ml-2 rounded-full bg-[#dd1969] px-3 py-1 text-xs font-semibold text-white">
                Best Value
              </span>
            )}
          </div>
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto mb-12 justify-items-center">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`bg-white rounded-2xl p-6 shadow-xl relative flex flex-col ${
                plan.popular ? 'ring-4 ring-[#dd1969] transform scale-105' : ''
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-[#dd1969] text-white px-4 py-1 rounded-full text-sm font-semibold">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">
                  {plan.name}
                </h3>
                <div className="mb-2">
                  <span className="text-4xl font-bold text-[#25314e]">
                    {isAnnual ? plan.annualPrice : plan.price}
                  </span>
                  <span className="text-gray-600 ml-1">
                    {isAnnual ? plan.annualPeriod : plan.period}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{plan.description}</p>
              </div>

              <div className="space-y-3 mb-6 flex-grow">
                {plan.features.map((feature, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-[#20adce] flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-gray-700">{feature}</span>
                  </div>
                ))}
              </div>

              <Button
                onClick={() => handleSelectPlan(plan.id)}
                disabled={isSubmitting && selectedPlan === plan.id}
                className={`w-full text-white font-semibold ${
                  plan.popular
                    ? 'bg-[#dd1969] hover:bg-[#c01559]'
                    : 'bg-[#20adce] hover:bg-[#1a8ba8]'
                }`}
              >
                {isSubmitting && selectedPlan === plan.id ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  `Select ${plan.name}`
                )}
              </Button>
            </div>
          ))}
        </div>

        {/* Feature Comparison Table */}
        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8 max-w-7xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6 text-center">
            Feature Comparison
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-4 px-4 font-semibold text-gray-900">
                    Feature
                  </th>
                  <th className="text-center py-4 px-4 font-semibold text-gray-900 bg-[#20adce]/10">
                    Premium
                  </th>
                  <th className="text-center py-4 px-4 font-semibold text-gray-900">
                    Elite
                  </th>
                  <th className="text-center py-4 px-4 font-semibold text-gray-900">
                    VIP
                  </th>
                </tr>
              </thead>
              <tbody>
                {(isProcessor ? processorFeatures : standardFeatures).map((feature, index) => {
                  const matrix = isProcessor ? processorFeatureMatrix : standardFeatureMatrix
                  return (
                    <tr
                      key={feature}
                      className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}
                    >
                      <td className="py-3 px-4 text-sm text-gray-700 font-medium">
                        {feature}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600 text-center bg-[#20adce]/5">
                        {matrix[feature]?.premium || '—'}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600 text-center">
                        {matrix[feature]?.elite || '—'}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600 text-center">
                        {matrix[feature]?.vip || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
