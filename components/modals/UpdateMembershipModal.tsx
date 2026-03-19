'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

interface UpdateMembershipModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentPlan: string
  onSelectPlan: (planName: string, priceId: string) => void
}

interface PlanTier {
  name: string
  displayName: string
  price: number
  annualPrice: number
  priceId: string
  annualPriceId: string
  features: string[]
  color: string
  isPopular?: boolean
}

const PLAN_TIERS: PlanTier[] = [
  {
    name: 'None',
    displayName: 'Free Trial',
    price: 0,
    annualPrice: 0,
    priceId: '',
    annualPriceId: '',
    color: 'bg-gray-100',
    features: [
      '30-Day Premium Trial',
      'No Credit Card Required',
      'Full access to premium membership with the following restrictions:',
      'NO free Scotsman Guide subscription',
      'NO loan escalations provided',
      'Try out AIME before becoming a member'
    ]
  },
  {
    name: 'Premium',
    displayName: 'Premium',
    price: 19.99,
    annualPrice: 199,
    priceId: 'price_premium_monthly',
    annualPriceId: 'price_premium_annual',
    color: 'bg-pink-50',
    isPopular: true,
    features: [
      'Exclusive Wholesale Pricing',
      'Full access to all AIME membership benefits and savings',
      'Support broker channel growth',
      'Access local talent referrals',
      'One loan escalation per year'
    ]
  },
  {
    name: 'Elite',
    displayName: 'Elite',
    price: 69.99,
    annualPrice: 699,
    priceId: 'price_elite_monthly',
    annualPriceId: 'price_elite_annual',
    color: 'bg-blue-50',
    features: [
      'Everything included in Premium',
      'Access to all AIME content',
      'Four DA ticket included',
      'Access local talent referrals',
      'Free Scotsman Guide Subscription (Annual Rate Members Only)',
      'Four loan escalations per year'
    ]
  },
  {
    name: 'VIP',
    displayName: 'VIP',
    price: 199.99,
    annualPrice: 1999,
    priceId: 'price_vip_monthly',
    annualPriceId: 'price_vip_annual',
    color: 'bg-purple-50',
    features: [
      'For Top Community Leaders',
      'Access to all AIME content',
      'Prioritized referrals & service from Vendor Services',
      'Four Free Tickets + VIP Guest Ticket',
      'All Four Volumes of Scotsman Guide',
      'Unlimited loan escalations'
    ]
  }
]

export function UpdateMembershipModal({
  open,
  onOpenChange,
  currentPlan,
  onSelectPlan
}: UpdateMembershipModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSelectPlan = async (plan: PlanTier) => {
    if (plan.name === currentPlan) {
      toast.info('This is your current plan')
      return
    }

    if (plan.name === 'None') {
      toast.error('Cannot downgrade to free trial')
      return
    }

    setSelectedPlan(plan.name)
    setLoading(true)

    try {
      // For now, use monthly price ID
      onSelectPlan(plan.name, plan.priceId)
      onOpenChange(false)
    } catch (error) {
      console.error('Error selecting plan:', error)
      toast.error('Failed to update membership')
    } finally {
      setLoading(false)
      setSelectedPlan(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Update Membership</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
          {PLAN_TIERS.map((plan) => {
            const isCurrentPlan = plan.name === currentPlan
            const isSelected = selectedPlan === plan.name

            return (
              <div
                key={plan.name}
                className={`relative rounded-lg border-2 p-6 transition-all ${
                  isCurrentPlan
                    ? 'border-[#dd1969] shadow-lg'
                    : 'border-gray-200 hover:border-gray-300'
                } ${plan.color}`}
              >
                {isCurrentPlan && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#dd1969] text-white">
                    Current Plan
                  </Badge>
                )}

                {plan.isPopular && !isCurrentPlan && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#20adce] text-white">
                    Most Popular
                  </Badge>
                )}

                <div className="text-center mb-4">
                  <h3 className="text-xl font-bold mb-2">{plan.displayName}</h3>
                  {plan.price > 0 ? (
                    <div className="mb-2">
                      <div className="text-3xl font-bold text-[#dd1969]">
                        ${plan.price}<span className="text-lg">/mo</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        ${plan.annualPrice}/yr
                      </div>
                    </div>
                  ) : (
                    <div className="text-3xl font-bold text-gray-900 mb-2">
                      FREE
                    </div>
                  )}
                </div>

                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <Check className="w-5 h-5 text-[#20adce] shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handleSelectPlan(plan)}
                  disabled={isCurrentPlan || loading}
                  className={`w-full ${
                    isCurrentPlan
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-[#dd1969] hover:bg-[#c01558]'
                  }`}
                >
                  {isCurrentPlan
                    ? 'Current Plan'
                    : isSelected
                    ? 'Processing...'
                    : 'Select Plan'}
                </Button>
              </div>
            )
          })}
        </div>

        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="font-semibold mb-2">Feature Comparison</h4>
          <div className="grid grid-cols-5 gap-4 text-sm">
            <div className="font-medium">Feature</div>
            <div className="text-center font-medium">Free</div>
            <div className="text-center font-medium">Premium</div>
            <div className="text-center font-medium">Elite</div>
            <div className="text-center font-medium">VIP</div>

            <div>Discounts from AIME Vendor Members and Partners</div>
            <div className="text-center"><Check className="w-4 h-4 mx-auto text-gray-400" /></div>
            <div className="text-center"><Check className="w-4 h-4 mx-auto text-[#20adce]" /></div>
            <div className="text-center"><Check className="w-4 h-4 mx-auto text-[#20adce]" /></div>
            <div className="text-center"><Check className="w-4 h-4 mx-auto text-[#20adce]" /></div>

            <div>Right to vote in all AIME member elections</div>
            <div className="text-center">✕</div>
            <div className="text-center"><Check className="w-4 h-4 mx-auto text-[#20adce]" /></div>
            <div className="text-center"><Check className="w-4 h-4 mx-auto text-[#20adce]" /></div>
            <div className="text-center"><Check className="w-4 h-4 mx-auto text-[#20adce]" /></div>

            <div>Eligible for nomination to join Committees</div>
            <div className="text-center">✕</div>
            <div className="text-center"><Check className="w-4 h-4 mx-auto text-[#20adce]" /></div>
            <div className="text-center"><Check className="w-4 h-4 mx-auto text-[#20adce]" /></div>
            <div className="text-center"><Check className="w-4 h-4 mx-auto text-[#20adce]" /></div>

            <div>Eligible to run for elected Board positions</div>
            <div className="text-center">✕</div>
            <div className="text-center"><Check className="w-4 h-4 mx-auto text-[#20adce]" /></div>
            <div className="text-center"><Check className="w-4 h-4 mx-auto text-[#20adce]" /></div>
            <div className="text-center"><Check className="w-4 h-4 mx-auto text-[#20adce]" /></div>

            <div>One Free Expo Ticket (Annual Only)</div>
            <div className="text-center">✕</div>
            <div className="text-center"><Check className="w-4 h-4 mx-auto text-[#20adce]" /></div>
            <div className="text-center">4 Tickets</div>
            <div className="text-center">VIP Table (4 tickets + 1 VIP Guest Ticket)</div>

            <div>Discount on AIME products/services/tickets</div>
            <div className="text-center">5% Off</div>
            <div className="text-center">10% Off</div>
            <div className="text-center">20% Off</div>
            <div className="text-center">30% Off</div>

            <div>Subscription to AIME newsletters</div>
            <div className="text-center"><Check className="w-4 h-4 mx-auto text-[#20adce]" /></div>
            <div className="text-center"><Check className="w-4 h-4 mx-auto text-[#20adce]" /></div>
            <div className="text-center"><Check className="w-4 h-4 mx-auto text-[#20adce]" /></div>
            <div className="text-center"><Check className="w-4 h-4 mx-auto text-[#20adce]" /></div>

            <div>Access to Brokers Are Best Facebook Group</div>
            <div className="text-center"><Check className="w-4 h-4 mx-auto text-[#20adce]" /></div>
            <div className="text-center"><Check className="w-4 h-4 mx-auto text-[#20adce]" /></div>
            <div className="text-center"><Check className="w-4 h-4 mx-auto text-[#20adce]" /></div>
            <div className="text-center"><Check className="w-4 h-4 mx-auto text-[#20adce]" /></div>

            <div>Access to Women's Mortgage Network (WMN) Facebook</div>
            <div className="text-center"><Check className="w-4 h-4 mx-auto text-[#20adce]" /></div>
            <div className="text-center"><Check className="w-4 h-4 mx-auto text-[#20adce]" /></div>
            <div className="text-center"><Check className="w-4 h-4 mx-auto text-[#20adce]" /></div>
            <div className="text-center"><Check className="w-4 h-4 mx-auto text-[#20adce]" /></div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
