export type UserRole =
  | 'admin'
  | 'super_admin'
  | 'member'
  | 'loan_officer'
  | 'broker_owner'
  | 'loan_officer_assistant'
  | 'processor'
  | 'partner_lender'
  | 'partner_vendor'

export type PlanTier =
  | 'None'
  | 'Premium Guest'
  | 'Premium'
  | 'Elite'
  | 'VIP'
  | 'Premium Processor'
  | 'Elite Processor'
  | 'VIP Processor'

export type ResourceType = 'video' | 'pdf' | 'podcast' | 'article'

export type EventType = 'webinar' | 'conference' | 'training' | 'networking' | 'other'

export interface Profile {
  id: string
  email: string
  full_name?: string
  role: UserRole
  plan_tier: PlanTier
  avatar_url?: string
  phone?: string
  company?: string
  stripe_customer_id?: string
  stripe_subscription_id?: string
  subscription_status?: string
  trial_start_date?: string
  trial_end_date?: string
  assigned_ae?: string
  assigned_ae_email?: string
  payment_failed_at?: string | null
  pending_plan_tier?: string | null
  pending_plan_effective_date?: string | null
  pending_plan_price_id?: string | null
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  name: string
  slug: string
  description?: string
  icon?: string
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Tag {
  id: string
  name: string
  slug: string
  color: string
  created_at: string
}

export interface Resource {
  id: string
  title: string
  slug: string
  description?: string
  content?: string
  resource_type: ResourceType
  thumbnail_url?: string
  file_url?: string
  video_url?: string
  duration?: number
  required_plan_tier: PlanTier[]
  category_id?: string
  is_featured: boolean
  is_published: boolean
  views_count: number
  published_at: string
  created_at: string
  updated_at: string
  created_by?: string
  category?: Category
  tags?: Tag[]
}

export interface Event {
  id: string
  title: string
  description?: string
  event_type: EventType
  start_date: string
  end_date: string
  timezone: string
  location?: string
  is_virtual: boolean
  meeting_url?: string
  registration_url?: string
  max_attendees?: number
  current_attendees: number
  required_plan_tier: PlanTier[]
  thumbnail_url?: string
  is_featured: boolean
  is_published: boolean
  created_at: string
  updated_at: string
  created_by?: string
}

export interface Lender {
  id: string
  name: string
  slug: string
  logo_url?: string
  description?: string
  website_url?: string
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  lender_type?: string
  states_served?: string[]
  features?: string[]
  products?: string[]
  badge_color: string
  display_order: number
  is_featured: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Vendor {
  id: string
  name: string
  slug: string
  logo_url?: string
  description?: string
  website_url?: string
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  vendor_category?: string
  features?: string[]
  pricing_info?: string
  badge_color: string
  display_order: number
  is_core_partner: boolean
  is_affiliate: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Coupon {
  id: string
  code: string
  description?: string
  discount_type: 'percentage' | 'fixed_amount' | 'trial_extension'
  discount_value?: number
  max_uses?: number
  current_uses: number
  max_uses_per_user: number
  valid_from: string
  valid_until?: string
  is_active: boolean
  applicable_plans?: PlanTier[]
  created_at: string
  created_by?: string
}

export interface SupportTicket {
  id: string
  user_id: string
  subject: string
  message: string
  category?: string
  priority: string
  ghl_contact_id?: string
  ghl_opportunity_id?: string
  ghl_pipeline_id?: string
  ghl_stage_id?: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  created_at: string
  updated_at: string
  resolved_at?: string
}

export interface UserActivity {
  id: string
  user_id: string
  activity_type: string
  resource_id?: string
  metadata?: Record<string, any>
  created_at: string
}

// Plan details for UI
export interface PlanDetails {
  name: string
  tier: PlanTier
  price: {
    monthly: number
    yearly: number
  }
  stripe_price_id_monthly?: string
  stripe_price_id_yearly?: string
  features: string[]
  limitations?: string[]
}

// Subscription Plan
export type BillingPeriod = 'monthly' | 'annual'

export interface SubscriptionPlan {
  id: string
  name: string
  description?: string
  plan_tier: PlanTier
  billing_period: BillingPeriod
  price: number
  currency: string
  stripe_product_id?: string
  stripe_price_id?: string
  features: string[]
  is_active: boolean
  is_featured: boolean
  sort_order: number
  created_at: string
  updated_at: string
  created_by?: string
}

// Subscription (User's active subscription)
export type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'paused'

export interface Subscription {
  id: string
  user_id: string
  plan_id: string
  stripe_subscription_id?: string
  status: SubscriptionStatus
  current_period_start?: string
  current_period_end?: string
  cancel_at_period_end: boolean
  canceled_at?: string
  trial_start?: string
  trial_end?: string
  created_at: string
  updated_at: string

  // Relations
  user?: Profile
  plan?: SubscriptionPlan
}

// Subscription Analytics
export interface SubscriptionAnalyticsData {
  mrr: number // Monthly Recurring Revenue
  arr: number // Annual Recurring Revenue
  active_subscriptions: number
  total_users: number
  plan_distribution: {
    plan_tier: PlanTier
    count: number
    percentage: number
  }[]
  growth_rate: number // Month-over-month growth percentage
  churn_rate: number // Cancellation rate
}

// Pending Checkout
export type CheckoutStatus = 'pending' | 'sent' | 'completed' | 'expired' | 'canceled'
export type CheckoutSentMethod = 'email' | 'copied' | 'manual'

export interface PendingCheckout {
  id: string
  stripe_checkout_session_id?: string
  user_email: string
  user_id?: string
  plan_id?: string
  plan_name?: string
  plan_price?: number
  billing_period?: string
  checkout_url?: string
  expires_at?: string
  status: CheckoutStatus
  created_by?: string
  created_by_email?: string
  sent_at?: string
  sent_method?: CheckoutSentMethod
  completed_at?: string
  subscription_id?: string
  notes?: string
  metadata?: Record<string, any>
  created_at: string
  updated_at: string
}

// ============================================
// Fuse Registration Types
// ============================================

export type FuseTicketType = 'general_admission' | 'general_admission_plus' | 'vip'
export type FuseGuestTicketType = 'vip_guest' | 'general_admission' | 'general_admission_plus' | 'vip'
export type FusePurchaseType = 'claimed' | 'purchased'
export type FuseRegistrationSource = 'ghl_form' | 'admin_manual'
export type FuseTier = 'Premium' | 'Elite' | 'VIP'

export interface FuseEvent {
  id: string
  name: string
  year: number
  start_date?: string
  end_date?: string
  location?: string
  registration_open: boolean
  claim_form_url?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface FuseRegistration {
  id: string
  fuse_event_id: string
  user_id?: string | null

  // Registrant info
  full_name: string
  email: string
  phone?: string
  company?: string

  // Ticket info
  ticket_type: FuseTicketType
  tier?: FuseTier | null
  purchase_type: FusePurchaseType

  // Add-ons
  has_hall_of_aime: boolean
  has_wmn_at_fuse: boolean

  // GHL integration
  ghl_contact_id?: string
  ghl_form_submission_id?: string

  // Source tracking
  registration_source: FuseRegistrationSource
  notes?: string

  // Metadata
  created_at: string
  updated_at: string
  created_by?: string

  // Relations (optional, populated with joins)
  fuse_event?: FuseEvent
  user?: Profile
  guests?: FuseRegistrationGuest[]
}

export interface FuseRegistrationGuest {
  id: string
  registration_id: string

  // Guest info
  full_name: string
  email?: string
  phone?: string

  // Ticket info
  ticket_type: FuseGuestTicketType
  is_included: boolean // TRUE if included with VIP, FALSE if purchased

  // Metadata
  created_at: string
}
