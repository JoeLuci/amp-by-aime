'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Briefcase, ChevronDown, FileText, Loader2, Check, ArrowLeft } from 'lucide-react'
import { UserRole } from '@/types/database.types'
import { loadStripe } from '@stripe/stripe-js'
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from '@stripe/react-stripe-js'
import {
  standardPlans,
  processorPlans,
  standardFeatures,
  standardFeatureMatrix,
  processorFeatures,
  processorFeatureMatrix,
} from '@/lib/plans'

type MemberType = 'broker' | 'processor'

const HIDDEN_PLAN_IDS = new Set(['elite', 'elite_processor'])

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const inputClass =
  'w-full h-12 px-4 bg-white text-gray-900 placeholder:text-gray-500 border-0 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#dd1969]/60'

function PageBackground() {
  return (
    <div className="fixed inset-0 z-0">
      <Image
        src="/assets/AMP-BackgroundFull-optimized.jpg"
        alt="AMP Background"
        fill
        className="object-cover"
        priority
      />
      <div className="absolute inset-0 dotted-pattern" />
    </div>
  )
}

function MemberTypeStep({ onSelect }: { onSelect: (t: MemberType) => void }) {
  const tiles: { type: MemberType; title: string; description: string; Icon: typeof Briefcase }[] = [
    {
      type: 'broker',
      title: 'Broker',
      description: 'Loan officers, broker owners, and assistants',
      Icon: Briefcase,
    },
    {
      type: 'processor',
      title: 'Processor',
      description: 'Loan processors with processor-specific pricing',
      Icon: FileText,
    },
  ]

  return (
    <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-10">
          <Image
            src="/assets/AMP_MemberPortalLogo_White.svg"
            alt="AMP AIME Member Portal"
            width={300}
            height={80}
            className="w-auto h-20 mx-auto mb-8"
            priority
          />
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            Become a Member
          </h1>
          <p className="text-white/80 text-base">
            Choose your member type to get started
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tiles.map(({ type, title, description, Icon }) => (
            <button
              key={type}
              type="button"
              onClick={() => onSelect(type)}
              className="group bg-white hover:bg-gray-50 rounded-2xl p-8 shadow-xl text-left transition-all hover:scale-[1.02]"
            >
              <div className="w-14 h-14 rounded-full bg-[#dd1969]/10 flex items-center justify-center mb-4 group-hover:bg-[#dd1969]/20 transition-colors">
                <Icon className="w-7 h-7 text-[#dd1969]" strokeWidth={2} />
              </div>
              <h2 className="text-2xl font-bold text-[#25314e] mb-1">{title}</h2>
              <p className="text-sm text-gray-600">{description}</p>
            </button>
          ))}
        </div>

        <p className="text-center text-sm text-white/80 mt-8">
          Already have an account?{' '}
          <Link href="/sign-in" className="font-semibold text-white hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function SignUpPage() {
  const [memberType, setMemberType] = useState<MemberType | null>(null)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    phone: '',
  })
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [isAnnual, setIsAnnual] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [isFeaturesOpen, setIsFeaturesOpen] = useState(false)
  const [createdUserId, setCreatedUserId] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)

  const isProcessor = memberType === 'processor'
  // Broker tile maps to loan_officer (most common). User can refine in complete-profile.
  const dbRole: UserRole = isProcessor ? 'processor' : 'loan_officer'

  const plans = (isProcessor ? processorPlans : standardPlans).filter(
    (p) => !HIDDEN_PLAN_IDS.has(p.id),
  )
  const featureRows = isProcessor ? processorFeatures : standardFeatures
  const featureMatrix = isProcessor ? processorFeatureMatrix : standardFeatureMatrix
  const selectedPlanIsValid = selectedPlan && plans.some((p) => p.id === selectedPlan)
  const effectiveSelectedPlan = selectedPlanIsValid ? selectedPlan : null

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!createdUserId && formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (!effectiveSelectedPlan) {
      toast.error('Please select a plan')
      return
    }

    setIsLoading(true)

    try {
      let userId = createdUserId

      // Only create the account on the first submit. Subsequent submits
      // (after "back" from embedded checkout) just create a new session.
      if (!userId) {
        const verifyRes = await fetch('/api/auth/verify-captcha', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName: formData.fullName, email: formData.email }),
        })
        if (verifyRes.status === 429) {
          toast.error('Too many signup attempts. Please try again later.')
          setIsLoading(false)
          return
        }
        if (verifyRes.status === 403) {
          toast.error('Unable to create account. Please contact support if this is an error.')
          setIsLoading(false)
          return
        }

        const supabase = createClient()

        const { data, error } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              full_name: formData.fullName,
              role: dbRole,
              phone: formData.phone,
            },
          },
        })

        if (error) throw error

        if (data.user?.id) {
          userId = data.user.id
          setCreatedUserId(userId)

          try {
            await fetch('/api/ghl/create-contact', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId,
                email: formData.email,
                fullName: formData.fullName,
                phone: formData.phone,
                role: dbRole,
              }),
            })
          } catch (ghlError) {
            console.error('GHL contact creation failed:', ghlError)
          }

          await supabase
            .from('profiles')
            .update({ onboarding_step: 'complete_profile' })
            .eq('id', userId)
        }
      }

      const checkoutRes = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: effectiveSelectedPlan,
          billingInterval: isAnnual ? 'annual' : 'monthly',
          userId,
          embedded: true,
        }),
      })

      if (!checkoutRes.ok) {
        let message = 'Failed to start checkout'
        try {
          const err = await checkoutRes.json()
          message = err.error || message
        } catch {}
        throw new Error(message)
      }

      const { clientSecret: secret } = await checkoutRes.json()
      if (!secret) throw new Error('No checkout client secret returned')

      setClientSecret(secret)
    } catch (error: any) {
      toast.error(error.message || 'Failed to create account')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCheckoutComplete = () => {
    window.location.href = '/onboarding/complete-profile'
  }

  const handleBackToForm = () => {
    setClientSecret(null)
  }

  if (!memberType) {
    return (
      <div className="min-h-screen relative">
        <PageBackground />
        <MemberTypeStep onSelect={setMemberType} />
      </div>
    )
  }

  return (
    <div className="min-h-screen relative">
      <PageBackground />

      <div className="relative z-10 px-4 py-10 md:py-14">
        <div className={`${clientSecret ? 'max-w-5xl' : 'max-w-4xl'} mx-auto`}>
          {!clientSecret && (
            <button
              type="button"
              onClick={() => {
                setMemberType(null)
                setSelectedPlan(null)
              }}
              className="flex items-center gap-1.5 text-sm text-white/80 hover:text-white mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Change member type
            </button>
          )}

          <div className="text-center mb-8">
            <Image
              src="/assets/AMP_MemberPortalLogo_White.svg"
              alt="AMP AIME Member Portal"
              width={260}
              height={70}
              className="w-auto h-16 mx-auto mb-5"
              priority
            />
            <h1 className="text-3xl md:text-4xl font-bold text-white">
              {isProcessor ? 'Processor Membership' : 'Broker Membership'}
            </h1>
            <p className="text-white/80 text-sm mt-2">
              Fill in your details and choose a plan
            </p>
          </div>

          {clientSecret ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleBackToForm}
                className="flex items-center gap-1.5 text-sm text-white/80 hover:text-white"
              >
                <ArrowLeft className="w-4 h-4" />
                Change plan
              </button>
              <div className="rounded-2xl overflow-hidden shadow-2xl">
                <EmbeddedCheckoutProvider
                  key={clientSecret}
                  stripe={stripePromise}
                  options={{ clientSecret, onComplete: handleCheckoutComplete }}
                >
                  <EmbeddedCheckout />
                </EmbeddedCheckoutProvider>
              </div>
            </div>
          ) : (
          <form onSubmit={handleSignUp} className="space-y-6">
            {/* Account fields */}
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Full Name"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                required
                className={inputClass}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className={inputClass}
                />
                <input
                  type="tel"
                  placeholder="Phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="password"
                  placeholder="Password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  minLength={6}
                  className={inputClass}
                />
                <input
                  type="password"
                  placeholder="Confirm Password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  required
                  minLength={6}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Plan picker */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <h2 className="text-lg font-bold text-white">Choose a plan</h2>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-semibold uppercase tracking-wider ${
                      !isAnnual ? 'text-white' : 'text-white/50'
                    }`}
                  >
                    Monthly
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsAnnual(!isAnnual)}
                    className="relative inline-flex h-6 w-11 items-center rounded-full bg-white/20 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
                  >
                    <span
                      className={`${
                        isAnnual ? 'translate-x-6' : 'translate-x-1'
                      } inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow`}
                    />
                  </button>
                  <span
                    className={`text-xs font-semibold uppercase tracking-wider ${
                      isAnnual ? 'text-white' : 'text-white/50'
                    }`}
                  >
                    Annual
                  </span>
                  {isAnnual && (
                    <span className="ml-1 rounded-full bg-[#dd1969] px-2.5 py-0.5 text-[10px] font-semibold text-white uppercase tracking-wider">
                      Best Value
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {plans.map((plan) => {
                  const selected = effectiveSelectedPlan === plan.id
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlan(plan.id)}
                      className={`relative bg-white rounded-2xl p-6 shadow-xl text-left flex flex-col transition-all cursor-pointer hover:-translate-y-1 hover:shadow-2xl ${
                        selected
                          ? 'ring-4 ring-[#dd1969] scale-[1.02]'
                          : plan.popular
                            ? 'ring-2 ring-[#dd1969]/40 hover:ring-4 hover:ring-[#dd1969]'
                            : 'ring-1 ring-white/30 hover:ring-2 hover:ring-[#20adce]'
                      }`}
                    >
                      {plan.popular && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                          <span className="bg-[#dd1969] text-white px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap">
                            Most Popular
                          </span>
                        </div>
                      )}

                      <div className="text-center mb-5">
                        <h3 className="text-xl font-bold text-gray-900 mb-2">
                          {plan.name}
                        </h3>
                        <div className="mb-2">
                          <span className="text-3xl font-bold text-[#25314e]">
                            {isAnnual ? plan.annualPrice : plan.price}
                          </span>
                          <span className="text-gray-600 ml-1 text-sm">
                            {isAnnual ? plan.annualPeriod : plan.period}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600">{plan.description}</p>
                      </div>

                      <div className="space-y-2.5 mb-5 flex-grow">
                        {plan.features.map((feature, index) => (
                          <div key={index} className="flex items-start gap-2">
                            <Check className="w-4 h-4 text-[#20adce] flex-shrink-0 mt-0.5" />
                            <span className="text-xs text-gray-700">{feature}</span>
                          </div>
                        ))}
                      </div>

                      <div
                        className={`w-full text-center py-2.5 rounded-full text-sm font-semibold transition-colors ${
                          selected
                            ? 'bg-[#dd1969] text-white'
                            : 'bg-[#20adce]/10 text-[#20adce]'
                        }`}
                      >
                        {selected ? 'Selected' : `Select ${plan.name}`}
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Expandable feature comparison */}
              <div className="mt-5 bg-white/5 backdrop-blur-sm rounded-2xl ring-1 ring-white/20 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsFeaturesOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-5 py-4 text-white hover:bg-white/5 transition-colors"
                  aria-expanded={isFeaturesOpen}
                >
                  <span className="text-sm font-semibold">
                    Compare all features
                  </span>
                  <ChevronDown
                    className={`w-5 h-5 transition-transform ${
                      isFeaturesOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isFeaturesOpen && (
                  <div className="bg-white p-4 md:p-6">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b-2 border-gray-200">
                            <th className="text-left py-3 px-3 text-sm font-semibold text-gray-900">
                              Feature
                            </th>
                            {plans.map((plan) => (
                              <th
                                key={plan.id}
                                className={`text-center py-3 px-3 text-sm font-semibold text-gray-900 ${
                                  plan.popular ? 'bg-[#20adce]/10' : ''
                                }`}
                              >
                                {plan.name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {featureRows.map((feature, index) => (
                            <tr
                              key={feature}
                              className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}
                            >
                              <td className="py-2.5 px-3 text-xs text-gray-700 font-medium">
                                {feature}
                              </td>
                              {plans.map((plan) => {
                                // matrix keys are base ids ('premium', 'vip') even for processor variants
                                const baseId = plan.id.replace('_processor', '')
                                return (
                                  <td
                                    key={plan.id}
                                    className={`py-2.5 px-3 text-xs text-gray-600 text-center ${
                                      plan.popular ? 'bg-[#20adce]/5' : ''
                                    }`}
                                  >
                                    {featureMatrix[feature]?.[baseId] || '—'}
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-14 bg-[#dd1969] hover:bg-[#c01559] text-white font-semibold text-base rounded-full shadow-lg"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Creating account...
                </>
              ) : (
                'Sign Up'
              )}
            </Button>

            <p className="text-center text-sm text-white/80">
              Already have an account?{' '}
              <Link href="/sign-in" className="font-semibold text-white hover:underline">
                Log in
              </Link>
            </p>
          </form>
          )}
        </div>
      </div>
    </div>
  )
}
