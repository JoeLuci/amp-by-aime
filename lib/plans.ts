// Plan + feature matrix data shared between the initial sign-up one-pager
// and the re-picker page at /onboarding/select-plan.

export interface PlanCard {
  id: string
  name: string
  price: string
  period: string
  annualPrice: string
  annualPeriod: string
  description: string
  features: string[]
  popular: boolean
}

// Non-processor plans
// NOTE: Premium Guest (id: 'free') has been hidden from checkout but not sunset
// It may return at a later date. Existing users can keep their tier.
export const standardPlans: PlanCard[] = [
  {
    id: 'premium',
    name: 'Premium',
    price: '$19.99',
    period: '/month',
    annualPrice: '$199',
    annualPeriod: '/year',
    description: 'Ideal for growing brokers looking to level up',
    features: [
      'Exclusive wholesale resources',
      'Educational content & training',
      'Broker channel growth support',
      'Fuse GA ticket (Annual only)',
      'One loan escalation per year',
      '10% discount on products/services',
      'Vendor partner discounts',
    ],
    popular: true,
  },
  {
    id: 'elite',
    name: 'Elite',
    price: '$69.99',
    period: '/month',
    annualPrice: '$699',
    annualPeriod: '/year',
    description: 'Built for teams and higher-volume shops',
    features: [
      'Everything in Premium',
      'Access to local client referrals',
      'Fuse GA ticket (Annual only)',
      'Six loan escalations per year',
      '20% discount on products/services',
      'Enhanced vendor partner access',
    ],
    popular: false,
  },
  {
    id: 'vip',
    name: 'VIP',
    price: '$199.99',
    period: '/month',
    annualPrice: '$1,999',
    annualPeriod: '/year',
    description: 'Best for leaders, influencers, and top-tier producers',
    features: [
      'Access to all AIME benefits',
      'Prioritized referrals and service',
      'VIP Fuse Ticket + VIP Guest Ticket',
      'Unlimited loan escalations',
      '30% discount on products/services',
      'Premium vendor partnership access',
      'Direct industry leader access',
    ],
    popular: false,
  },
]

// Processor plans (different pricing and benefits)
export const processorPlans: PlanCard[] = [
  {
    id: 'premium_processor',
    name: 'Premium Processor',
    price: '$19.99',
    period: '/month',
    annualPrice: '$199',
    annualPeriod: '/year',
    description: 'Essential benefits for processors',
    features: [
      'Exclusive processor resources',
      'Educational content & training',
      'Processing workflow tools',
      'Fuse GA ticket (Annual only)',
      'One loan escalation per year',
      '10% discount on products/services',
      'Vendor partner discounts',
    ],
    popular: true,
  },
  {
    id: 'elite_processor',
    name: 'Elite Processor',
    price: '$39.99',
    period: '/month',
    annualPrice: '$399',
    annualPeriod: '/year',
    description: 'Advanced tools for professional processors',
    features: [
      'Everything in Premium Processor',
      'Advanced processing resources',
      'Fuse GA ticket (Annual only)',
      'Six loan escalations per year',
      '20% discount on products/services',
      'Enhanced vendor partner access',
    ],
    popular: false,
  },
  {
    id: 'vip_processor',
    name: 'VIP Processor',
    price: '$119',
    period: '/month',
    annualPrice: '$1,199',
    annualPeriod: '/year',
    description: 'Premium experience for top processors',
    features: [
      'Access to all AIME benefits',
      'Prioritized support and service',
      'VIP Fuse Ticket + VIP Guest Ticket',
      'Unlimited loan escalations',
      '30% discount on products/services',
      'Premium vendor partnership access',
      'Direct industry leader access',
    ],
    popular: false,
  },
]

export const standardFeatures = [
  'Discounts from AIME Vendor Members and Partners',
  'Right to vote in all AIME member elections',
  'Eligible for nomination to join Committees',
  'Eligible to run for elected Board positions',
  'One Free Fuse Ticket (Annual Only)',
  'Discount on AIME products/services/tickets',
  'Subscription to AIME newsletters',
  'Access to Brokers Are Best Facebook Group',
  "Access to Women's Mortgage Network (WMN) Facebook Group",
  'Access to AIME VIP Facebook Group',
  'Webinar Replays',
  'Mortgage Mornings',
  'Lender and Vendor Webinars',
  'Discounted surety bond program',
  'Escalation of loan issues with AIME Lender Members',
  'Scotsman Guide Top Originators',
]

export const standardFeatureMatrix: Record<string, Record<string, string>> = {
  'Discounts from AIME Vendor Members and Partners': {
    free: '✗',
    premium: '✓',
    elite: '✓',
    vip: '✓',
  },
  'Right to vote in all AIME member elections': {
    free: '✗',
    premium: '✓',
    elite: '✓',
    vip: '✓',
  },
  'Eligible for nomination to join Committees': {
    free: '✗',
    premium: '✓',
    elite: '✓',
    vip: '✓',
  },
  'Eligible to run for elected Board positions': {
    free: '✗',
    premium: '✓',
    elite: '✓',
    vip: '✓',
  },
  'One Free Fuse Ticket (Annual Only)': {
    free: '✗',
    premium: '1 GA Ticket',
    elite: '1 GA Ticket',
    vip: '1 VIP Ticket & 1 VIP Guest',
  },
  'Discount on AIME products/services/tickets': {
    free: '✗',
    premium: '10% Off',
    elite: '20% Off',
    vip: '30% Off',
  },
  'Subscription to AIME newsletters': {
    free: '✓',
    premium: '✓',
    elite: '✓',
    vip: '✓',
  },
  'Access to Brokers Are Best Facebook Group': {
    free: '✓',
    premium: '✓',
    elite: '✓',
    vip: '✓',
  },
  "Access to Women's Mortgage Network (WMN) Facebook Group": {
    free: '✓',
    premium: '✓',
    elite: '✓',
    vip: '✓',
  },
  'Access to AIME VIP Facebook Group': {
    free: '✗',
    premium: '✗',
    elite: '✗',
    vip: '✓',
  },
  'Webinar Replays': {
    free: '✓',
    premium: '✓',
    elite: '✓',
    vip: '✓',
  },
  'Mortgage Mornings': {
    free: '✓',
    premium: '✓',
    elite: '✓',
    vip: '✓',
  },
  'Lender and Vendor Webinars': {
    free: '✓',
    premium: '✓',
    elite: '✓',
    vip: '✓',
  },
  'Discounted surety bond program': {
    free: '✗',
    premium: '✓',
    elite: '✓',
    vip: '✓',
  },
  'Escalation of loan issues with AIME Lender Members': {
    free: '✗',
    premium: '1/year',
    elite: '6/year',
    vip: 'Unlimited',
  },
  'Scotsman Guide Top Originators': {
    free: 'Free Sub + 20% Off',
    premium: 'Free Sub + 20% Off',
    elite: 'Free Sub + 20% Off',
    vip: 'Free Sub + 20% Off',
  },
}

export const processorFeatures = [
  'Right to vote in all AIME member elections',
  'Eligible for nomination to join Committees',
  'Eligible to run for elected Board positions',
  'One Free Fuse Ticket (Annual Only)',
  'Discount on AIME products/services/tickets',
  'Subscription to AIME newsletters',
  'Access to Brokers Are Best Facebook Group',
  "Access to Women's Mortgage Network (WMN) Facebook Group",
  'Access to AIME VIP Facebook Group',
  'Webinar Replays',
  'Mortgage Mornings',
  'Lender and Vendor Webinars',
  'Discounted surety bond program',
  'Escalation of loan issues with AIME Lender Members',
  'Scotsman Guide Top Originators',
]

export const processorFeatureMatrix: Record<string, Record<string, string>> = {
  'Right to vote in all AIME member elections': {
    free: '—',
    premium: '✓',
    elite: '✓',
    vip: '✓',
  },
  'Eligible for nomination to join Committees': {
    free: '—',
    premium: '✓',
    elite: '✓',
    vip: '✓',
  },
  'Eligible to run for elected Board positions': {
    free: '—',
    premium: '✓',
    elite: '✓',
    vip: '✓',
  },
  'One Free Fuse Ticket (Annual Only)': {
    free: '—',
    premium: '1 GA Ticket',
    elite: '1 GA Ticket',
    vip: '1 VIP Ticket & 1 VIP Guest',
  },
  'Discount on AIME products/services/tickets': {
    free: '—',
    premium: '10% Off',
    elite: '20% Off',
    vip: '30% Off',
  },
  'Subscription to AIME newsletters': {
    free: '✓',
    premium: '✓',
    elite: '✓',
    vip: '✓',
  },
  'Access to Brokers Are Best Facebook Group': {
    free: '✓',
    premium: '✓',
    elite: '✓',
    vip: '✓',
  },
  "Access to Women's Mortgage Network (WMN) Facebook Group": {
    free: '✓',
    premium: '✓',
    elite: '✓',
    vip: '✓',
  },
  'Access to AIME VIP Facebook Group': {
    free: '—',
    premium: '—',
    elite: '—',
    vip: '✓',
  },
  'Webinar Replays': {
    free: '✓',
    premium: '✓',
    elite: '✓',
    vip: '✓',
  },
  'Mortgage Mornings': {
    free: '✓',
    premium: '✓',
    elite: '✓',
    vip: '✓',
  },
  'Lender and Vendor Webinars': {
    free: '✓',
    premium: '✓',
    elite: '✓',
    vip: '✓',
  },
  'Discounted surety bond program': {
    free: '—',
    premium: '✓',
    elite: '✓',
    vip: '✓',
  },
  'Escalation of loan issues with AIME Lender Members': {
    free: '—',
    premium: '1/year',
    elite: '3/year',
    vip: '6/year',
  },
  'Scotsman Guide Top Originators': {
    free: 'Free Sub + 20% Off',
    premium: 'Free Sub + 20% Off',
    elite: 'Free Sub + 20% Off',
    vip: 'Free Sub + 20% Off',
  },
}
