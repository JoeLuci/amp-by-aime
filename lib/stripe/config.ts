import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing STRIPE_SECRET_KEY environment variable')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-10-29.clover',
  typescript: true,
})

// Price IDs from Stripe Dashboard - replace with actual IDs after creating products
// Each plan has both monthly and annual pricing
// Free Trial uses a special price ID with a 90-day trial period
export const STRIPE_PRICE_IDS = {
  free_trial: process.env.STRIPE_FREE_TRIAL_PRICE_ID || '',
  premium_monthly: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID || '',
  premium_annual: process.env.STRIPE_PREMIUM_ANNUAL_PRICE_ID || '',
  elite_monthly: process.env.STRIPE_ELITE_MONTHLY_PRICE_ID || '',
  elite_annual: process.env.STRIPE_ELITE_ANNUAL_PRICE_ID || '',
  vip_monthly: process.env.STRIPE_VIP_MONTHLY_PRICE_ID || '',
  vip_annual: process.env.STRIPE_VIP_ANNUAL_PRICE_ID || '',
} as const

export const PLAN_DETAILS = {
  'Free Trial': {
    name: 'Free Trial',
    stripePriceId: STRIPE_PRICE_IDS.free_trial,
    monthlyAmount: 0,
    trialPeriodDays: 90,
  },
  None: {
    name: 'None',
    stripePriceId: null,
    monthlyAmount: 0,
    annualAmount: 0,
  },
  Premium: {
    name: 'Premium',
    stripePriceIdMonthly: STRIPE_PRICE_IDS.premium_monthly,
    stripePriceIdAnnual: STRIPE_PRICE_IDS.premium_annual,
    monthlyAmount: 1999, // $19.99/month
    annualAmount: 19900, // $199/year
  },
  Elite: {
    name: 'Elite',
    stripePriceIdMonthly: STRIPE_PRICE_IDS.elite_monthly,
    stripePriceIdAnnual: STRIPE_PRICE_IDS.elite_annual,
    monthlyAmount: 6999, // $69.99/month
    annualAmount: 69900, // $699/year
  },
  VIP: {
    name: 'VIP',
    stripePriceIdMonthly: STRIPE_PRICE_IDS.vip_monthly,
    stripePriceIdAnnual: STRIPE_PRICE_IDS.vip_annual,
    monthlyAmount: 19999, // $199.99/month
    annualAmount: 199900, // $1,999/year
  },
} as const
