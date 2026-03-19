'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CreditCard, Plus, Minus, X, Loader2, Copy, Check, AlertCircle, Upload, RefreshCw, Pencil } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface User {
  id: string
  email?: string
  full_name?: string
  first_name?: string
  last_name?: string
  phone?: string
  role?: string
  is_admin?: boolean
  subscription_tier?: string
  subscription_status?: string
  stripe_customer_id?: string
  stripe_subscription_id?: string
  subscription_end_date?: string
  escalations_remaining?: number
  plan_tier?: string
  last_login_at?: string
  has_completed_trial?: boolean
  engagement_level?: string
  ghl_contact_id?: string
  // Partner/Vendor/Lender specific fields
  company_name?: string
  connections_contact_name?: string
  connections_contact_email?: string
  connections_contact_phone?: string
  escalations_contact_name?: string
  escalations_contact_email?: string
  escalations_contact_phone?: string
  // Extended profile fields
  avatar_url?: string
  address?: string
  city?: string
  state?: string
  zip_code?: string
  nmls_number?: string
  state_licenses?: string[]
  birthday?: string
  gender?: string
  languages_spoken?: string[]
  race?: string
  company?: string
  company_nmls?: string
  company_address?: string
  company_city?: string
  company_state?: string
  company_zip_code?: string
  company_phone?: string
  scotsman_guide_subscription?: boolean
  // Admin override fields
  subscription_override?: boolean
  override_plan_tier?: string
  override_subscription_status?: string
  override_reason?: string
  override_set_by?: string
  override_set_at?: string
  override_expires_at?: string
}

interface EngagementLevel {
  id: string
  name: string
  description?: string
  color: string
  sort_order: number
}

interface SubscriptionPlan {
  id: string
  name: string
  plan_tier: string
  billing_period: string
  price: number
  stripe_price_id?: string
  is_active: boolean
  features?: string[]
  description?: string
}

interface EditUserModalProps {
  user: User | null
  isOpen: boolean
  onClose: () => void
  isSuperAdmin?: boolean
  defaultTab?: 'info' | 'profile' | 'engagement' | 'subscription' | 'escalations'
  /** When provided, clicking Subscription tab redirects to this URL instead of showing content */
  subscriptionRedirectUrl?: string
  /** Subscription plans from database - used for pricing display */
  plans?: SubscriptionPlan[]
}

const TIER_PRICES: Record<string, { monthly: number; annual: number }> = {
  free: { monthly: 0, annual: 0 },
  premium_guest: { monthly: 0, annual: 0 },
  premium: { monthly: 19.99, annual: 199 },
  elite: { monthly: 69.99, annual: 699 },
  vip: { monthly: 199.99, annual: 1999 },
  // Processor plans (same tier names, same pricing structure)
  processor_premium_guest: { monthly: 0, annual: 0 },
  processor_premium: { monthly: 19.99, annual: 199 },
  processor_elite: { monthly: 69.99, annual: 699 },
  processor_vip: { monthly: 199.99, annual: 1999 },
}

const PLAN_HIERARCHY: Record<string, number> = {
  'none': 0,
  'None': 0,
  'premium_guest': 1,
  'Premium Guest': 1,
  'premium': 2,
  'Premium': 2,
  'elite': 3,
  'Elite': 3,
  'vip': 4,
  'VIP': 4,
  // Processor plans (same hierarchy levels)
  'processor_premium_guest': 1,
  'processor_premium': 2,
  'processor_elite': 3,
  'processor_vip': 4,
}

// Loan Officer / Broker plans (Premium Guest excluded - trial only, not admin-assignable)
const LO_PLANS = [
  { id: 'premium', name: 'Premium', color: 'bg-blue-100 text-blue-800', monthlyPrice: 29, annualPrice: 249 },
  { id: 'elite', name: 'Elite', color: 'bg-purple-100 text-purple-800', monthlyPrice: 59, annualPrice: 499 },
  { id: 'vip', name: 'VIP', color: 'bg-yellow-100 text-yellow-800', monthlyPrice: 99, annualPrice: 899 },
]

// Processor plans (Premium Guest excluded - trial only, not admin-assignable)
const PROCESSOR_PLANS = [
  { id: 'processor_premium', name: 'Premium', color: 'bg-blue-100 text-blue-800', monthlyPrice: 14, annualPrice: 124 },
  { id: 'processor_elite', name: 'Elite', color: 'bg-purple-100 text-purple-800', monthlyPrice: 29, annualPrice: 249 },
  { id: 'processor_vip', name: 'VIP', color: 'bg-yellow-100 text-yellow-800', monthlyPrice: 49, annualPrice: 449 },
]

// All plans combined for lookup
const ALL_PLANS = [...LO_PLANS, ...PROCESSOR_PLANS]

export function EditUserModal({ user, isOpen, onClose, isSuperAdmin = false, defaultTab = 'info', subscriptionRedirectUrl, plans = [] }: EditUserModalProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<any>(null)
  const [customerPaymentMethod, setCustomerPaymentMethod] = useState<any>(null)
  const [loadingPayment, setLoadingPayment] = useState(false)
  const [stripeSubscription, setStripeSubscription] = useState<any>(null)
  const [loadingStripeSubscription, setLoadingStripeSubscription] = useState(false)
  const [stripeSubscriptionError, setStripeSubscriptionError] = useState<string | null>(null)
  const [isUpgrading, setIsUpgrading] = useState(false)
  const [selectedBillingInterval, setSelectedBillingInterval] = useState<'monthly' | 'annual'>('annual')
  const [useExistingCard, setUseExistingCard] = useState(true)
  const [billImmediately, setBillImmediately] = useState(true)
  const [prorationPreview, setProrationPreview] = useState<{
    amountDue: number
    prorationCredit: number
    prorationCharge: number
    currency: string
  } | null>(null)
  const [loadingProration, setLoadingProration] = useState(false)
  const [couponCode, setCouponCode] = useState('')
  const [availableCoupons, setAvailableCoupons] = useState<any[]>([])
  const [loadingCoupons, setLoadingCoupons] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [isSyncingFromStripe, setIsSyncingFromStripe] = useState(false)
  const [editingStripeIds, setEditingStripeIds] = useState(false)
  const [stripeCustomerIdInput, setStripeCustomerIdInput] = useState('')
  const [stripeSubscriptionIdInput, setStripeSubscriptionIdInput] = useState('')
  const [savingStripeIds, setSavingStripeIds] = useState(false)

  // Build tier prices dynamically from plans prop
  const tierPrices = useMemo(() => {
    const prices: Record<string, { monthly: number; annual: number }> = {
      free: { monthly: 0, annual: 0 },
      premium_guest: { monthly: 0, annual: 0 },
      processor_premium_guest: { monthly: 0, annual: 0 },
    }

    // Group plans by tier and billing period
    plans.forEach(plan => {
      if (!plan.is_active) return

      // Normalize tier name to lowercase with underscores
      const tierKey = plan.plan_tier.toLowerCase().replace(/\s+/g, '_')

      if (!prices[tierKey]) {
        prices[tierKey] = { monthly: 0, annual: 0 }
      }

      if (plan.billing_period === 'monthly') {
        prices[tierKey].monthly = Number(plan.price)
      } else if (plan.billing_period === 'annual') {
        prices[tierKey].annual = Number(plan.price)
      }
    })

    return prices
  }, [plans])

  // Build plan lists dynamically from plans prop
  const { loPlans, processorPlans, allDynamicPlans } = useMemo(() => {
    const loPlansList: { id: string; name: string; color: string; monthlyPrice: number; annualPrice: number; tier: string }[] = []
    const processorPlansList: { id: string; name: string; color: string; monthlyPrice: number; annualPrice: number; tier: string }[] = []

    const tierColors: Record<string, string> = {
      'Premium': 'bg-blue-100 text-blue-800',
      'Elite': 'bg-purple-100 text-purple-800',
      'VIP': 'bg-yellow-100 text-yellow-800',
      'Premium Processor': 'bg-blue-100 text-blue-800',
      'Elite Processor': 'bg-purple-100 text-purple-800',
      'VIP Processor': 'bg-yellow-100 text-yellow-800',
    }

    // Group plans by tier to get both monthly and annual prices
    const tierMap = new Map<string, { monthly?: SubscriptionPlan; annual?: SubscriptionPlan }>()

    plans.forEach(plan => {
      if (!plan.is_active) return
      // Skip guest plans - they're trial only, not admin-assignable
      if (plan.plan_tier.includes('Guest')) return

      if (!tierMap.has(plan.plan_tier)) {
        tierMap.set(plan.plan_tier, {})
      }
      const tierData = tierMap.get(plan.plan_tier)!
      if (plan.billing_period === 'monthly') {
        tierData.monthly = plan
      } else {
        tierData.annual = plan
      }
    })

    // Convert to plan list format
    tierMap.forEach((data, tier) => {
      const monthlyPrice = data.monthly?.price ? Number(data.monthly.price) : 0
      const annualPrice = data.annual?.price ? Number(data.annual.price) : 0
      const planId = tier.toLowerCase().replace(/\s+/g, '_')

      const planEntry = {
        id: planId,
        name: tier.replace(' Processor', ''),
        color: tierColors[tier] || 'bg-gray-100 text-gray-800',
        monthlyPrice,
        annualPrice,
        tier,
      }

      if (tier.includes('Processor')) {
        processorPlansList.push(planEntry)
      } else {
        loPlansList.push(planEntry)
      }
    })

    // Sort by price (ascending)
    loPlansList.sort((a, b) => a.annualPrice - b.annualPrice)
    processorPlansList.sort((a, b) => a.annualPrice - b.annualPrice)

    return {
      loPlans: loPlansList,
      processorPlans: processorPlansList,
      allDynamicPlans: [...loPlansList, ...processorPlansList],
    }
  }, [plans])

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    role: '',
    escalations_remaining: 0,
    has_completed_trial: false,
    engagement_level: '',
    // Partner/Vendor/Lender specific fields
    company_name: '',
    connections_contact_name: '',
    connections_contact_email: '',
    connections_contact_phone: '',
    escalations_contact_name: '',
    escalations_contact_email: '',
    escalations_contact_phone: '',
    // Extended profile fields
    avatar_url: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    nmls_number: '',
    state_licenses: [] as string[],
    birthday: '',
    gender: '',
    languages_spoken: [] as string[],
    race: '',
    company: '',
    company_nmls: '',
    company_address: '',
    company_city: '',
    company_state: '',
    company_zip_code: '',
    company_phone: '',
    scotsman_guide_subscription: false,
  })
  const [engagementLevels, setEngagementLevels] = useState<EngagementLevel[]>([])
  const [loadingEngagementLevels, setLoadingEngagementLevels] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string>('')

  // Confirmation dialog state
  const [cancelSubDialogOpen, setCancelSubDialogOpen] = useState(false)
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false)
  const [pendingPlanChange, setPendingPlanChange] = useState<{ id: string; name: string; tier: string } | null>(null)

  // Admin override state
  const [overrideEnabled, setOverrideEnabled] = useState(false)
  const [overrideTier, setOverrideTier] = useState('')
  const [overrideStatus, setOverrideStatus] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideExpires, setOverrideExpires] = useState('')
  const [savingOverride, setSavingOverride] = useState(false)
  const [editingOverride, setEditingOverride] = useState(false)
  const [savedOverrideData, setSavedOverrideData] = useState<{
    tier: string
    status: string
    reason: string
    expires: string
  } | null>(null)

  // Tab state for controlled tabs (needed for subscription redirect)
  const [activeTab, setActiveTab] = useState(defaultTab)

  // Handle tab change with redirect support
  const handleTabChange = (value: string) => {
    if (value === 'subscription' && subscriptionRedirectUrl && user) {
      onClose()
      router.push(`${subscriptionRedirectUrl}?user=${user.id}`)
      return
    }
    setActiveTab(value as typeof defaultTab)
  }

  // Reset tab when modal opens/closes or defaultTab changes
  useEffect(() => {
    setActiveTab(defaultTab)
  }, [defaultTab, isOpen])

  // Fetch proration preview when upgrade dialog opens with immediate billing
  useEffect(() => {
    if (pendingPlanChange && billImmediately && user?.stripe_subscription_id) {
      // Get the price ID for the selected plan
      const getPriceId = async () => {
        const supabase = createClient()
        const { data: plan, error } = await supabase
          .from('subscription_plans')
          .select('stripe_price_id, name, price, plan_tier, billing_period')
          .eq('plan_tier', pendingPlanChange.tier)
          .eq('billing_period', selectedBillingInterval)
          .eq('is_active', true)
          .single()

        console.log('Proration lookup:', {
          lookingFor: { tier: pendingPlanChange.tier, billingPeriod: selectedBillingInterval },
          found: plan,
          error,
        })

        if (plan?.stripe_price_id) {
          fetchProrationPreview(user.stripe_subscription_id!, plan.stripe_price_id)
        }
      }
      getPriceId()
    } else {
      setProrationPreview(null)
    }
  }, [pendingPlanChange, billImmediately, selectedBillingInterval, user?.stripe_subscription_id])

  useEffect(() => {
    if (user) {
      // If first/last name are empty but full_name exists, try to split it
      let firstName = user.first_name || ''
      let lastName = user.last_name || ''

      if (!firstName && !lastName && user.full_name) {
        const nameParts = user.full_name.split(' ')
        firstName = nameParts[0] || ''
        lastName = nameParts.slice(1).join(' ') || ''
      }

      setFormData({
        first_name: firstName,
        last_name: lastName,
        email: user.email || '',
        phone: user.phone || '',
        role: user.role || '',
        escalations_remaining: user.escalations_remaining || 0,
        has_completed_trial: user.has_completed_trial || false,
        engagement_level: user.engagement_level || '',
        // Partner/Vendor/Lender specific fields
        company_name: user.company_name || '',
        connections_contact_name: user.connections_contact_name || '',
        connections_contact_email: user.connections_contact_email || '',
        connections_contact_phone: user.connections_contact_phone || '',
        escalations_contact_name: user.escalations_contact_name || '',
        escalations_contact_email: user.escalations_contact_email || '',
        escalations_contact_phone: user.escalations_contact_phone || '',
        // Extended profile fields
        avatar_url: user.avatar_url || '',
        address: user.address || '',
        city: user.city || '',
        state: user.state || '',
        zip_code: user.zip_code || '',
        nmls_number: user.nmls_number || '',
        state_licenses: user.state_licenses || [],
        birthday: user.birthday || '',
        gender: user.gender || '',
        languages_spoken: user.languages_spoken || [],
        race: user.race || '',
        company: user.company || '',
        company_nmls: user.company_nmls || '',
        company_address: user.company_address || '',
        company_city: user.company_city || '',
        company_state: user.company_state || '',
        company_zip_code: user.company_zip_code || '',
        company_phone: user.company_phone || '',
        scotsman_guide_subscription: user.scotsman_guide_subscription || false,
      })
      setAvatarPreview(user.avatar_url || '')
      setStripeCustomerIdInput(user.stripe_customer_id || '')
      setStripeSubscriptionIdInput(user.stripe_subscription_id || '')
      setEditingStripeIds(false)

      // Fetch fresh override data from database (page data may be cached)
      const fetchOverrideData = async () => {
        const supabase = createClient()
        const { data: freshUser } = await supabase
          .from('profiles')
          .select('subscription_override, override_plan_tier, override_subscription_status, override_reason, override_expires_at')
          .eq('id', user.id)
          .single()

        const userData = freshUser || user
        const isEnabled = userData.subscription_override || false
        const tier = userData.override_plan_tier || ''
        const status = userData.override_subscription_status || ''
        const reason = userData.override_reason || ''
        const expires = userData.override_expires_at ? userData.override_expires_at.split('T')[0] : ''

        setOverrideEnabled(isEnabled)
        setOverrideTier(tier)
        setOverrideStatus(status)
        setOverrideReason(reason)
        setOverrideExpires(expires)

        // Track saved state for read-only display
        if (isEnabled && tier) {
          setSavedOverrideData({ tier, status, reason, expires })
          setEditingOverride(false)
        } else {
          setSavedOverrideData(null)
          setEditingOverride(true) // Start in edit mode if no override
        }
      }
      fetchOverrideData()

      // Fetch subscription details from Stripe (also gets customer payment method if no subscription)
      if (user.stripe_subscription_id || user.stripe_customer_id) {
        fetchStripeSubscription(user.id)
      } else {
        setStripeSubscription(null)
        setCustomerPaymentMethod(null)
      }

      // Fetch available coupons
      fetchCoupons()

      // Fetch engagement levels
      fetchEngagementLevels()
    }
  }, [user])

  const fetchEngagementLevels = async () => {
    setLoadingEngagementLevels(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('engagement_levels')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (error) throw error
      setEngagementLevels(data || [])
    } catch (error) {
      console.error('Error fetching engagement levels:', error)
      // Set default levels if table doesn't exist yet
      setEngagementLevels([
        { id: '1', name: 'Super Member', description: 'Highly active', color: '#22c55e', sort_order: 1 },
        { id: '2', name: 'Engaged Member', description: 'Regular user', color: '#3b82f6', sort_order: 2 },
        { id: '3', name: 'Unengaged Member', description: 'Inactive', color: '#ef4444', sort_order: 3 },
      ])
    } finally {
      setLoadingEngagementLevels(false)
    }
  }

  const saveSubscriptionOverride = async () => {
    if (!user) return

    setSavingOverride(true)
    try {
      const supabase = createClient()

      // Get current admin user
      const { data: { user: adminUser } } = await supabase.auth.getUser()

      const updateData: Record<string, any> = {
        subscription_override: overrideEnabled,
        override_plan_tier: overrideEnabled ? overrideTier : null,
        override_subscription_status: overrideEnabled ? overrideStatus : null,
        override_reason: overrideEnabled ? overrideReason : null,
        override_set_by: overrideEnabled ? adminUser?.id : null,
        override_set_at: overrideEnabled ? new Date().toISOString() : null,
        override_expires_at: overrideEnabled && overrideExpires ? `${overrideExpires}T23:59:59Z` : null,
        updated_at: new Date().toISOString(),
      }

      // If override is enabled and tier is set, also update the actual plan_tier
      // This ensures the user has immediate access
      if (overrideEnabled && overrideTier) {
        updateData.plan_tier = overrideTier
      }
      if (overrideEnabled && overrideStatus) {
        updateData.subscription_status = overrideStatus
        updateData.stripe_subscription_status = overrideStatus
      }

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id)

      if (error) throw error

      // Refetch user data to show updated values
      const { data: updatedUser } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (updatedUser) {
        // Update local form data to reflect changes
        setFormData(prev => ({
          ...prev,
          plan_tier: updatedUser.plan_tier,
          subscription_status: updatedUser.subscription_status,
        }))
      }

      // Update saved state and exit edit mode
      if (overrideEnabled && overrideTier) {
        setSavedOverrideData({
          tier: overrideTier,
          status: overrideStatus,
          reason: overrideReason,
          expires: overrideExpires,
        })
        setEditingOverride(false)
      } else {
        setSavedOverrideData(null)
      }

      toast.success(
        overrideEnabled
          ? `Override saved: ${overrideTier} tier, ${overrideStatus} status`
          : 'Admin override removed'
      )
    } catch (error: any) {
      console.error('Error saving override:', error)
      toast.error(error.message || 'Failed to save override')
    } finally {
      setSavingOverride(false)
    }
  }

  const fetchCoupons = async () => {
    setLoadingCoupons(true)
    try {
      const supabase = createClient()
      const { data: coupons } = await supabase
        .from('coupons')
        .select('*')
        .eq('is_active', true)
        .order('code', { ascending: true })

      setAvailableCoupons(coupons || [])
    } catch (error) {
      console.error('Error fetching coupons:', error)
    } finally {
      setLoadingCoupons(false)
    }
  }

  const fetchStripeSubscription = async (userId: string) => {
    setLoadingStripeSubscription(true)
    setStripeSubscriptionError(null)
    try {
      const response = await fetch(`/api/admin/subscriptions/${userId}`)
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fetch subscription')
      }
      const data = await response.json()
      setStripeSubscription(data.subscription)
      // Set payment method from subscription data
      if (data.subscription?.paymentMethod) {
        setPaymentMethod(data.subscription.paymentMethod)
      }
      // Also set customer payment method (available even without active subscription)
      if (data.customerPaymentMethod) {
        setCustomerPaymentMethod(data.customerPaymentMethod)
      }
    } catch (error: any) {
      console.error('Error fetching subscription:', error)
      setStripeSubscription(null)
      setStripeSubscriptionError(error.message || 'Failed to fetch Stripe subscription data')
    } finally {
      setLoadingStripeSubscription(false)
    }
  }

  // Sync database with actual Stripe subscription data
  const syncFromStripe = async () => {
    if (!user) return

    setIsSyncingFromStripe(true)
    try {
      const response = await fetch(`/api/admin/subscriptions/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_from_stripe' }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to sync from Stripe')
      }

      const result = await response.json()
      toast.success(result.message || 'Synced from Stripe successfully')

      // Refresh the data
      router.refresh()
      fetchStripeSubscription(user.id)
    } catch (error: any) {
      console.error('Error syncing from Stripe:', error)
      toast.error(error.message || 'Failed to sync from Stripe')
    } finally {
      setIsSyncingFromStripe(false)
    }
  }

  // Save Stripe IDs (super admin only)
  const saveStripeIds = async () => {
    if (!user) return

    setSavingStripeIds(true)
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stripe_customer_id: stripeCustomerIdInput.trim(),
          stripe_subscription_id: stripeSubscriptionIdInput.trim(),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update Stripe IDs')
      }

      toast.success('Stripe IDs updated successfully')
      setEditingStripeIds(false)
      router.refresh()

      // Re-fetch Stripe subscription data with new IDs
      if (stripeSubscriptionIdInput.trim() || stripeCustomerIdInput.trim()) {
        fetchStripeSubscription(user.id)
      }
    } catch (error: any) {
      console.error('Error saving Stripe IDs:', error)
      toast.error(error.message || 'Failed to update Stripe IDs')
    } finally {
      setSavingStripeIds(false)
    }
  }

  // Fetch proration preview for immediate upgrades
  const fetchProrationPreview = async (subscriptionId: string, newPriceId: string) => {
    setLoadingProration(true)
    setProrationPreview(null)
    try {
      const response = await fetch('/api/admin/subscriptions/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId, newPriceId }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to get proration preview')
      }
      const data = await response.json()
      setProrationPreview(data.preview)
    } catch (error: any) {
      console.error('Error fetching proration preview:', error)
      // Don't show error toast, just don't display preview
    } finally {
      setLoadingProration(false)
    }
  }

  // Handle avatar image upload
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB')
      return
    }

    setIsUploadingAvatar(true)

    try {
      const supabase = createClient()

      // Create unique file name
      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}-${Date.now()}.${fileExt}`
      const filePath = `avatars/${fileName}`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      // Update form data with new avatar URL
      setFormData({ ...formData, avatar_url: publicUrl })
      setAvatarPreview(publicUrl)
      toast.success('Image uploaded successfully!')
    } catch (error: any) {
      console.error('Error uploading image:', error)
      toast.error(error.message || 'Failed to upload image')
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  // Toggle state license selection
  const toggleStateLicense = (state: string) => {
    setFormData(prev => ({
      ...prev,
      state_licenses: prev.state_licenses.includes(state)
        ? prev.state_licenses.filter(s => s !== state)
        : [...prev.state_licenses, state]
    }))
  }

  // Toggle language selection
  const toggleLanguage = (language: string) => {
    setFormData(prev => ({
      ...prev,
      languages_spoken: prev.languages_spoken.includes(language)
        ? prev.languages_spoken.filter(l => l !== language)
        : [...prev.languages_spoken, language]
    }))
  }

  // Handle profile tab submit (saves all profile fields)
  const handleProfileSubmit = async () => {
    setIsSubmitting(true)

    try {
      const response = await fetch(`/api/admin/users/${user!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: formData.first_name,
          last_name: formData.last_name,
          phone: formData.phone,
          avatar_url: formData.avatar_url,
          address: formData.address,
          city: formData.city,
          state: formData.state,
          zip_code: formData.zip_code,
          nmls_number: formData.nmls_number,
          state_licenses: formData.state_licenses,
          birthday: formData.birthday,
          gender: formData.gender,
          languages_spoken: formData.languages_spoken,
          race: formData.race,
          company: formData.company,
          company_nmls: formData.company_nmls,
          company_address: formData.company_address,
          company_city: formData.company_city,
          company_state: formData.company_state,
          company_zip_code: formData.company_zip_code,
          company_phone: formData.company_phone,
          scotsman_guide_subscription: formData.scotsman_guide_subscription,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update profile')
      }

      toast.success('Profile updated successfully')
      router.refresh()
      onClose()
    } catch (error: any) {
      console.error('Error updating profile:', error)
      toast.error(error.message || 'Failed to update profile. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)

    try {
      // Use the admin API route to update user (bypasses RLS)
      const response = await fetch(`/api/admin/users/${user!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: formData.first_name,
          last_name: formData.last_name,
          email: formData.email,
          phone: formData.phone,
          role: formData.role,
          escalations_remaining: formData.escalations_remaining,
          has_completed_trial: formData.has_completed_trial,
          engagement_level: formData.engagement_level,
          // Company info - save from whichever field is populated
          company: formData.company || formData.company_name,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update user')
      }

      // Update GHL contact if user has a GHL contact ID
      if (user?.ghl_contact_id) {
        try {
          const ghlResponse = await fetch('/api/ghl/update-contact', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contactId: user.ghl_contact_id,
              email: formData.email,
              fullName: `${formData.first_name} ${formData.last_name}`,
              phone: formData.phone,
              role: formData.role,
              planTier: user.subscription_tier || user.plan_tier,
              subscriptionStatus: user.subscription_status,
            }),
          })

          if (!ghlResponse.ok) {
            const ghlError = await ghlResponse.json()
            console.warn('GHL contact update failed:', ghlError.error)
            // Don't block the save - just log the warning
          }
        } catch (ghlError) {
          console.warn('GHL contact update failed:', ghlError)
          // Don't block the save - just log the warning
        }
      }

      toast.success('User updated successfully')
      router.refresh()
      onClose()
    } catch (error: any) {
      console.error('Error updating user:', error)
      toast.error(error.message || 'Failed to update user. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handlePartnerSubmit = async () => {
    // Validate required fields
    if (!formData.first_name || !formData.last_name || !formData.company_name) {
      toast.error('Please fill in all required fields')
      return
    }

    // Validate connections contact
    if (!formData.connections_contact_name || !formData.connections_contact_email || !formData.connections_contact_phone) {
      toast.error('Please fill in Connections Contact information')
      return
    }

    // Validate escalations contact for lenders
    if (user?.role === 'partner_lender') {
      if (!formData.escalations_contact_name || !formData.escalations_contact_email || !formData.escalations_contact_phone) {
        toast.error('Please fill in Escalations Contact information for lenders')
        return
      }
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/admin/update-vendor-lender', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user!.id,
          first_name: formData.first_name,
          last_name: formData.last_name,
          phone: formData.phone,
          company_name: formData.company_name,
          connections_contact_name: formData.connections_contact_name,
          connections_contact_email: formData.connections_contact_email,
          connections_contact_phone: formData.connections_contact_phone,
          escalations_contact_name: formData.escalations_contact_name,
          escalations_contact_email: formData.escalations_contact_email,
          escalations_contact_phone: formData.escalations_contact_phone,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update vendor/lender')
      }

      toast.success(`${user?.role === 'partner_vendor' ? 'Vendor' : 'Lender'} updated successfully`)
      router.refresh()
      onClose()
    } catch (error: any) {
      console.error('Error updating vendor/lender:', error)
      toast.error(error.message || 'Failed to update. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancelSubscriptionClick = () => {
    setCancelSubDialogOpen(true)
  }

  const handleCancelSubscription = async (immediate: boolean = true) => {
    setCancelSubDialogOpen(false)
    setIsSubmitting(true)

    try {
      // Cancel subscription in Stripe using the subscriptions API
      const response = await fetch(`/api/admin/subscriptions/${user!.id}?immediate=${immediate}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to cancel subscription')
      }

      toast.success(immediate
        ? 'Subscription cancelled immediately'
        : 'Subscription will be cancelled at the end of the billing period')
      router.refresh()
      onClose()
    } catch (error: any) {
      console.error('Error cancelling subscription:', error)
      toast.error(error.message || 'Failed to cancel subscription. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const adjustEscalations = (amount: number) => {
    setFormData({
      ...formData,
      escalations_remaining: Math.max(0, formData.escalations_remaining + amount),
    })
  }

  const handleUpgradeDowngradeClick = (planId: string, planName: string, planTier: string) => {
    setPendingPlanChange({ id: planId, name: planName, tier: planTier })
    setUpgradeDialogOpen(true)
  }

  const handleUpgradeDowngrade = async () => {
    if (!pendingPlanChange) return

    setUpgradeDialogOpen(false)
    const targetPlan = pendingPlanChange.id
    setPendingPlanChange(null)
    setIsUpgrading(true)
    try {
      // Check if we have a card on file to use
      const hasCardOnFile = paymentMethod || customerPaymentMethod
      const shouldUseExistingCard = useExistingCard && hasCardOnFile

      const response = await fetch('/api/admin/upgrade-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user!.id,
          planId: targetPlan,
          billingInterval: selectedBillingInterval,
          couponCode: couponCode || undefined,
          useExistingCard: shouldUseExistingCard,
          billImmediately,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process subscription change')
      }

      if (data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url
      } else {
        // Subscription updated/created successfully without checkout
        toast.success(data.message || 'Subscription updated successfully')
        router.refresh()
        onClose()
      }
    } catch (error: any) {
      console.error('Error changing subscription:', error)
      toast.error(error.message || 'Failed to change subscription. Please try again.')
    } finally {
      setIsUpgrading(false)
    }
  }

  const getActionText = (targetPlan: string) => {
    const currentPlanKey = (user?.subscription_tier?.toLowerCase() || 'free') as string
    const currentTier = (currentPlanKey in PLAN_HIERARCHY)
      ? PLAN_HIERARCHY[currentPlanKey as keyof typeof PLAN_HIERARCHY]
      : 0

    const targetPlanKey = targetPlan.toLowerCase()
    const targetTier = (targetPlanKey in PLAN_HIERARCHY)
      ? PLAN_HIERARCHY[targetPlanKey as keyof typeof PLAN_HIERARCHY]
      : 0

    if (targetTier > currentTier) return 'upgrade'
    if (targetTier < currentTier) return 'downgrade'
    return 'change plan for'
  }

  const handleUpdateCard = async () => {
    if (!user?.stripe_customer_id) {
      toast.error('User does not have a Stripe customer ID. Create one by upgrading their plan first.')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/admin/update-payment-method', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          customerId: user.stripe_customer_id,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create payment update session')
      }

      if (data.url) {
        // Redirect to Stripe Checkout for card update
        window.location.href = data.url
      }
    } catch (error: any) {
      console.error('Error updating payment method:', error)
      toast.error(error.message || 'Failed to update payment method. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  if (!user) return null

  // Check if user is a vendor/lender (partner) - they only get User Info tab
  const isPartner = user.role === 'partner_vendor' || user.role === 'partner_lender'

  // Check if user is an admin - they only get User Info tab (no subscription/escalations/engagement)
  const isAdminUser = user.is_admin || user.role === 'admin' || user.role === 'super_admin'

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Edit {isAdminUser ? 'Admin' : isPartner ? (user.role === 'partner_vendor' ? 'Vendor' : 'Lender') : 'User'} - {formData.first_name} {formData.last_name}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2">
              <span className="text-sm text-gray-600 block">{user.email}</span>
              {!isPartner && !isAdminUser && (
                <div className="flex items-center gap-4 flex-wrap">
                {user.stripe_customer_id && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Customer ID:</span>
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded">{user.stripe_customer_id}</code>
                    <button
                      onClick={() => handleCopy(user.stripe_customer_id!, 'customer')}
                      className="text-gray-400 hover:text-gray-600"
                      title="Copy Customer ID"
                    >
                      {copiedField === 'customer' ? (
                        <Check className="w-3 h-3 text-green-600" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                )}
                {user.stripe_subscription_id && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Subscription ID:</span>
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded">{user.stripe_subscription_id}</code>
                    <button
                      onClick={() => handleCopy(user.stripe_subscription_id!, 'subscription')}
                      className="text-gray-400 hover:text-gray-600"
                      title="Copy Subscription ID"
                    >
                      {copiedField === 'subscription' ? (
                        <Check className="w-3 h-3 text-green-600" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                )}
                </div>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          {(isPartner || isAdminUser) ? (
            <TabsList className="grid w-full grid-cols-1">
              <TabsTrigger value="info">User Info</TabsTrigger>
            </TabsList>
          ) : (
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="info">User Info</TabsTrigger>
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="engagement">Engagement</TabsTrigger>
              <TabsTrigger value="subscription">Subscription</TabsTrigger>
              <TabsTrigger value="escalations">Escalations</TabsTrigger>
            </TabsList>
          )}

          {/* User Info Tab */}
          <TabsContent value="info" className="space-y-4">
            {isAdminUser ? (
              /* Admin User Edit Form - simplified, only basic info */
              <>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700">
                    {user.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                  </div>
                  <p className="text-xs text-gray-500">Admin role cannot be changed here</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="first_name">First Name *</Label>
                    <Input
                      id="first_name"
                      value={formData.first_name}
                      onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="last_name">Last Name *</Label>
                    <Input
                      id="last_name"
                      value={formData.last_name}
                      onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      disabled
                      className="bg-gray-50 cursor-not-allowed"
                    />
                    <p className="text-xs text-gray-500">Email cannot be changed</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="(555) 555-5555"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="flex-1 bg-[#dd1969] hover:bg-[#c01559]"
                  >
                    {isSubmitting ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : isPartner ? (
              /* Partner (Vendor/Lender) Edit Form */
              <div className="space-y-6">
                {/* Type Display (Read-only) */}
                <div className="space-y-2">
                  <Label>Type</Label>
                  <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700">
                    {user.role === 'partner_vendor' ? 'Vendor' : 'Lender'}
                  </div>
                </div>

                {/* Company Name */}
                <div className="space-y-2">
                  <Label htmlFor="company_name">Company Name *</Label>
                  <Input
                    id="company_name"
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    required
                  />
                </div>

                {/* Primary User Info */}
                <div className="border-t pt-4">
                  <h3 className="font-semibold text-gray-900 mb-4">Primary User Account</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="first_name">First Name *</Label>
                        <Input
                          id="first_name"
                          value={formData.first_name}
                          onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="last_name">Last Name *</Label>
                        <Input
                          id="last_name"
                          value={formData.last_name}
                          onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          disabled
                          className="bg-gray-50 cursor-not-allowed"
                        />
                        <p className="text-xs text-gray-500">Email cannot be changed</p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone</Label>
                        <Input
                          id="phone"
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          placeholder="(555) 555-5555"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Connections Contact */}
                <div className="border-t pt-4">
                  <h3 className="font-semibold text-gray-900 mb-4">Connections Contact *</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="connections_contact_name">Contact Name *</Label>
                      <Input
                        id="connections_contact_name"
                        value={formData.connections_contact_name}
                        onChange={(e) => setFormData({ ...formData, connections_contact_name: e.target.value })}
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="connections_contact_email">Contact Email *</Label>
                        <Input
                          id="connections_contact_email"
                          type="email"
                          value={formData.connections_contact_email}
                          onChange={(e) => setFormData({ ...formData, connections_contact_email: e.target.value })}
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="connections_contact_phone">Contact Phone *</Label>
                        <Input
                          id="connections_contact_phone"
                          type="tel"
                          value={formData.connections_contact_phone}
                          onChange={(e) => setFormData({ ...formData, connections_contact_phone: e.target.value })}
                          placeholder="(555) 555-5555"
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Escalations Contact (Lenders only) */}
                {user.role === 'partner_lender' && (
                  <div className="border-t pt-4">
                    <h3 className="font-semibold text-gray-900 mb-4">Escalations Contact *</h3>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="escalations_contact_name">Contact Name *</Label>
                        <Input
                          id="escalations_contact_name"
                          value={formData.escalations_contact_name}
                          onChange={(e) => setFormData({ ...formData, escalations_contact_name: e.target.value })}
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="escalations_contact_email">Contact Email *</Label>
                          <Input
                            id="escalations_contact_email"
                            type="email"
                            value={formData.escalations_contact_email}
                            onChange={(e) => setFormData({ ...formData, escalations_contact_email: e.target.value })}
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="escalations_contact_phone">Contact Phone *</Label>
                          <Input
                            id="escalations_contact_phone"
                            type="tel"
                            value={formData.escalations_contact_phone}
                            onChange={(e) => setFormData({ ...formData, escalations_contact_phone: e.target.value })}
                            placeholder="(555) 555-5555"
                            required
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    onClick={handlePartnerSubmit}
                    disabled={isSubmitting}
                    className="flex-1 bg-[#dd1969] hover:bg-[#c01559]"
                  >
                    {isSubmitting ? 'Saving...' : `Save ${user.role === 'partner_vendor' ? 'Vendor' : 'Lender'}`}
                  </Button>
                  <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              /* Regular User Edit Form */
              <>
                <div className="space-y-2">
                  <Label htmlFor="role">Role *</Label>
                  <select
                    id="role"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b1554]"
                    required
                  >
                    <option value="">Select role...</option>
                    <option value="broker_owner">Broker Owner</option>
                    <option value="loan_officer">Loan Officer</option>
                    <option value="loan_officer_assistant">Loan Officer Assistant</option>
                    <option value="processor">Processor</option>
                  </select>
                  <p className="text-xs text-gray-500">
                    Internal roles (Admin, Partner, Member) are managed separately
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="first_name">First Name *</Label>
                    <Input
                      id="first_name"
                      value={formData.first_name}
                      onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="last_name">Last Name *</Label>
                    <Input
                      id="last_name"
                      value={formData.last_name}
                      onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="(555) 555-5555"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="flex-1 bg-[#dd1969] hover:bg-[#c01559]"
                  >
                    {isSubmitting ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          {/* Profile Tab - Extended profile editing for admins */}
          <TabsContent value="profile" className="space-y-6">
            {/* Profile Picture */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold mb-4">Profile Picture</h4>
              <div className="flex items-center gap-6">
                <div className="relative">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Profile"
                      className="w-20 h-20 rounded-full object-cover border-4 border-gray-200"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#20adce] to-[#dd1969] flex items-center justify-center text-white text-2xl font-bold">
                      {formData.first_name?.[0]}{formData.last_name?.[0]}
                    </div>
                  )}
                  {isUploadingAvatar && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>
                  )}
                </div>
                <div>
                  <input
                    type="file"
                    id="admin-avatar-upload"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                    disabled={isUploadingAvatar}
                  />
                  <Button
                    onClick={() => document.getElementById('admin-avatar-upload')?.click()}
                    variant="outline"
                    disabled={isUploadingAvatar}
                    size="sm"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {isUploadingAvatar ? 'Uploading...' : 'Change Picture'}
                  </Button>
                  <p className="text-xs text-gray-500 mt-2">
                    JPG, PNG or GIF. Max size 5MB.
                  </p>
                </div>
              </div>
            </div>

            {/* Personal Information */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold mb-4">Personal Information</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="profile_first_name">First Name</Label>
                  <Input
                    id="profile_first_name"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile_last_name">Last Name</Label>
                  <Input
                    id="profile_last_name"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile_phone">Mobile Phone</Label>
                  <Input
                    id="profile_phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(555) 555-5555"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile_nmls">Individual NMLS</Label>
                  <Input
                    id="profile_nmls"
                    value={formData.nmls_number}
                    onChange={(e) => setFormData({ ...formData, nmls_number: e.target.value })}
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="profile_address">Mailing Address</Label>
                  <Input
                    id="profile_address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile_city">City</Label>
                  <Input
                    id="profile_city"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile_state">State</Label>
                  <Input
                    id="profile_state"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile_zip">Zip Code</Label>
                  <Input
                    id="profile_zip"
                    value={formData.zip_code}
                    onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile_birthday">Birthday</Label>
                  <Input
                    id="profile_birthday"
                    type="date"
                    value={formData.birthday}
                    onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile_gender">Gender</Label>
                  <Select value={formData.gender} onValueChange={(value) => setFormData({ ...formData, gender: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                      <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile_race">Race</Label>
                  <Select value={formData.race} onValueChange={(value) => setFormData({ ...formData, race: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select race" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Asian">Asian</SelectItem>
                      <SelectItem value="Black or African American">Black or African American</SelectItem>
                      <SelectItem value="Hispanic or Latino">Hispanic or Latino</SelectItem>
                      <SelectItem value="White">White</SelectItem>
                      <SelectItem value="Native American or Alaska Native">Native American or Alaska Native</SelectItem>
                      <SelectItem value="Native Hawaiian or Pacific Islander">Native Hawaiian or Pacific Islander</SelectItem>
                      <SelectItem value="Two or More Races">Two or More Races</SelectItem>
                      <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* State Licenses */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold mb-4">State Licenses</h4>
              <Select onValueChange={(value) => toggleStateLicense(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Add state license" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'].map(state => (
                    <SelectItem key={state} value={state}>{state}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.state_licenses.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {formData.state_licenses.map(state => (
                    <span
                      key={state}
                      className="bg-gray-100 px-3 py-1 rounded-full text-sm flex items-center gap-2"
                    >
                      {state}
                      <button
                        type="button"
                        onClick={() => toggleStateLicense(state)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Languages Spoken */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold mb-4">Languages Spoken</h4>
              <Select onValueChange={(value) => toggleLanguage(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Add language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="English">English</SelectItem>
                  <SelectItem value="Spanish">Spanish</SelectItem>
                  <SelectItem value="Mandarin">Mandarin</SelectItem>
                  <SelectItem value="French">French</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
              {formData.languages_spoken.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {formData.languages_spoken.map(lang => (
                    <span
                      key={lang}
                      className="bg-gray-100 px-3 py-1 rounded-full text-sm flex items-center gap-2"
                    >
                      {lang}
                      <button
                        type="button"
                        onClick={() => toggleLanguage(lang)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Company Information */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold mb-4">Company Information</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="profile_company">Company Name</Label>
                  <Input
                    id="profile_company"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile_company_nmls">Company NMLS</Label>
                  <Input
                    id="profile_company_nmls"
                    value={formData.company_nmls}
                    onChange={(e) => setFormData({ ...formData, company_nmls: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile_company_phone">Company Phone</Label>
                  <Input
                    id="profile_company_phone"
                    type="tel"
                    value={formData.company_phone}
                    onChange={(e) => setFormData({ ...formData, company_phone: e.target.value })}
                    placeholder="(555) 555-5555"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="profile_company_address">Company Address</Label>
                  <Input
                    id="profile_company_address"
                    value={formData.company_address}
                    onChange={(e) => setFormData({ ...formData, company_address: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile_company_city">Company City</Label>
                  <Input
                    id="profile_company_city"
                    value={formData.company_city}
                    onChange={(e) => setFormData({ ...formData, company_city: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile_company_state">Company State</Label>
                  <Input
                    id="profile_company_state"
                    value={formData.company_state}
                    onChange={(e) => setFormData({ ...formData, company_state: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile_company_zip">Company Zip Code</Label>
                  <Input
                    id="profile_company_zip"
                    value={formData.company_zip_code}
                    onChange={(e) => setFormData({ ...formData, company_zip_code: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Subscriptions */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold mb-4">Subscriptions</h4>
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="scotsman_guide"
                  checked={formData.scotsman_guide_subscription}
                  onCheckedChange={(checked) => setFormData({ ...formData, scotsman_guide_subscription: checked as boolean })}
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="scotsman_guide"
                    className="text-sm font-medium leading-none cursor-pointer"
                  >
                    Scotsman Guide Subscription
                  </label>
                  <p className="text-sm text-gray-500">
                    Opted in for free Scotsman Guide subscription
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleProfileSubmit}
                disabled={isSubmitting}
                className="flex-1 bg-[#dd1969] hover:bg-[#c01559]"
              >
                {isSubmitting ? 'Saving...' : 'Save Profile'}
              </Button>
              <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
            </div>
          </TabsContent>

          {/* Engagement Tab */}
          <TabsContent value="engagement" className="space-y-4">
            {/* Last Login */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold mb-4">Login Activity</h4>
              <div className="space-y-2">
                <Label>Last Login</Label>
                <div className="text-lg font-medium">
                  {user?.last_login_at
                    ? new Date(user.last_login_at).toLocaleString()
                    : 'Never logged in'}
                </div>
                {user?.last_login_at && (
                  <p className="text-sm text-gray-500">
                    {(() => {
                      const diff = Date.now() - new Date(user.last_login_at).getTime()
                      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
                      if (days === 0) return 'Today'
                      if (days === 1) return 'Yesterday'
                      return `${days} days ago`
                    })()}
                  </p>
                )}
              </div>
            </div>

            {/* Trial Status */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold mb-4">Trial Status</h4>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="has_completed_trial"
                  checked={formData.has_completed_trial}
                  onChange={(e) => setFormData({ ...formData, has_completed_trial: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-300 text-[#dd1969] focus:ring-[#dd1969]"
                />
                <Label htmlFor="has_completed_trial" className="cursor-pointer">
                  Has completed a free trial
                </Label>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Check this if the user has already used their free trial period
              </p>
            </div>

            {/* Engagement Level */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold mb-4">Engagement Level</h4>
              {loadingEngagementLevels ? (
                <p className="text-sm text-gray-500">Loading engagement levels...</p>
              ) : isSuperAdmin ? (
                // Super admins can edit engagement level
                <div className="space-y-3">
                  {engagementLevels.map((level) => (
                    <label
                      key={level.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        formData.engagement_level === level.name
                          ? 'border-[#dd1969] bg-pink-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="engagement_level"
                        value={level.name}
                        checked={formData.engagement_level === level.name}
                        onChange={(e) => setFormData({ ...formData, engagement_level: e.target.value })}
                        className="w-4 h-4 text-[#dd1969] focus:ring-[#dd1969]"
                      />
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: level.color }}
                      />
                      <div className="flex-1">
                        <p className="font-medium">{level.name}</p>
                        {level.description && (
                          <p className="text-sm text-gray-500">{level.description}</p>
                        )}
                      </div>
                    </label>
                  ))}
                  {formData.engagement_level && (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, engagement_level: '' })}
                      className="text-sm text-gray-500 hover:text-gray-700 underline"
                    >
                      Clear selection
                    </button>
                  )}
                </div>
              ) : (
                // Non-super-admins see read-only view
                <div className="space-y-3">
                  {formData.engagement_level ? (
                    (() => {
                      const currentLevel = engagementLevels.find(l => l.name === formData.engagement_level)
                      return (
                        <div className="flex items-center gap-3 p-3 rounded-lg border-2 border-gray-200 bg-gray-50">
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: currentLevel?.color || '#9ca3af' }}
                          />
                          <div className="flex-1">
                            <p className="font-medium">{formData.engagement_level}</p>
                            {currentLevel?.description && (
                              <p className="text-sm text-gray-500">{currentLevel.description}</p>
                            )}
                          </div>
                        </div>
                      )
                    })()
                  ) : (
                    <div className="flex items-center gap-3 p-3 rounded-lg border-2 border-gray-200 bg-gray-50">
                      <div className="w-4 h-4 rounded-full bg-gray-300" />
                      <p className="text-gray-500">No engagement level set</p>
                    </div>
                  )}
                  <p className="text-sm text-gray-500 italic">
                    Engagement level is calculated automatically based on user activity points. Only Super Admins can manually override this value.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 bg-[#dd1969] hover:bg-[#c01559]"
              >
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
            </div>
          </TabsContent>

          {/* Subscription Tab */}
          <TabsContent value="subscription" className="space-y-4">
            {/* Admin Override Section */}
            <div className={`border rounded-lg p-4 ${overrideEnabled ? 'border-orange-300 bg-orange-50' : 'border-gray-200'}`}>
              {/* Read-only view when override is saved and not editing */}
              {savedOverrideData && !editingOverride ? (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">Admin Override</h4>
                      <Badge className="bg-orange-100 text-orange-800">Active</Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingOverride(true)}
                    >
                      Edit
                    </Button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <div className="text-gray-500">Tier:</div>
                    <div className="font-medium">{savedOverrideData.tier}</div>
                    <div className="text-gray-500">Status:</div>
                    <div className="font-medium capitalize">{savedOverrideData.status}</div>
                    {savedOverrideData.reason && (
                      <>
                        <div className="text-gray-500">Reason:</div>
                        <div className="font-medium">{savedOverrideData.reason}</div>
                      </>
                    )}
                    {savedOverrideData.expires && (
                      <>
                        <div className="text-gray-500">Expires:</div>
                        <div className="font-medium">{new Date(savedOverrideData.expires + 'T00:00:00').toLocaleDateString()}</div>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* Edit mode / New override */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">Admin Override</h4>
                      {overrideEnabled && (
                        <Badge className="bg-orange-100 text-orange-800">Active</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="override-enabled"
                        checked={overrideEnabled}
                        onCheckedChange={(checked) => setOverrideEnabled(checked as boolean)}
                      />
                      <Label htmlFor="override-enabled" className="text-sm cursor-pointer">
                        Enable Override
                      </Label>
                    </div>
                  </div>

                  {overrideEnabled && (
                    <div className="space-y-3">
                      <p className="text-sm text-orange-700 mb-3">
                        Override Stripe data and grant manual access. Use for manual payments, paused collections, or billing issues.
                      </p>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-sm">Override Tier</Label>
                          <Select value={overrideTier} onValueChange={setOverrideTier}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select tier..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Premium">Premium</SelectItem>
                              <SelectItem value="Elite">Elite</SelectItem>
                              <SelectItem value="VIP">VIP</SelectItem>
                              <SelectItem value="Premium Processor">Premium Processor</SelectItem>
                              <SelectItem value="Elite Processor">Elite Processor</SelectItem>
                              <SelectItem value="VIP Processor">VIP Processor</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="text-sm">Override Status</Label>
                          <Select value={overrideStatus} onValueChange={setOverrideStatus}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="trialing">Trialing</SelectItem>
                              <SelectItem value="paused">Paused</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm">Reason for Override</Label>
                        <Input
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                          placeholder="e.g., Manual payment collected, scheduled billing pause..."
                        />
                      </div>

                      <div>
                        <Label className="text-sm">Override Expires (optional)</Label>
                        <Input
                          type="date"
                          value={overrideExpires}
                          onChange={(e) => setOverrideExpires(e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                        />
                        <p className="text-xs text-gray-500 mt-1">Leave blank for no expiration</p>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 pt-3 border-t border-gray-200 flex gap-2">
                    {/* Only show button if override is enabled OR if there's a saved override to remove */}
                    {(overrideEnabled || savedOverrideData) && (
                      <Button
                        onClick={saveSubscriptionOverride}
                        disabled={savingOverride}
                        size="sm"
                        className={overrideEnabled ? 'bg-orange-600 hover:bg-orange-700' : 'bg-red-600 hover:bg-red-700'}
                      >
                        {savingOverride ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : overrideEnabled ? (
                          'Save Override'
                        ) : (
                          'Remove Override'
                        )}
                      </Button>
                    )}
                    {savedOverrideData && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Reset to saved values and exit edit mode
                          setOverrideEnabled(true)
                          setOverrideTier(savedOverrideData.tier)
                          setOverrideStatus(savedOverrideData.status)
                          setOverrideReason(savedOverrideData.reason)
                          setOverrideExpires(savedOverrideData.expires)
                          setEditingOverride(false)
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Stripe IDs Management - Super Admin Only */}
            {isSuperAdmin && (
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold">Stripe IDs</h4>
                  {!editingStripeIds ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingStripeIds(true)}
                    >
                      <Pencil className="w-3 h-3 mr-1" />
                      Edit
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={saveStripeIds}
                        disabled={savingStripeIds}
                        className="bg-[#dd1969] hover:bg-[#c01559]"
                      >
                        {savingStripeIds ? (
                          <>
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          'Save'
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setStripeCustomerIdInput(user?.stripe_customer_id || '')
                          setStripeSubscriptionIdInput(user?.stripe_subscription_id || '')
                          setEditingStripeIds(false)
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <Label className="text-sm text-gray-500">Customer ID</Label>
                    {editingStripeIds ? (
                      <Input
                        value={stripeCustomerIdInput}
                        onChange={(e) => setStripeCustomerIdInput(e.target.value)}
                        placeholder="cus_..."
                        className="mt-1 font-mono text-sm"
                      />
                    ) : (
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-sm bg-gray-100 px-2 py-1 rounded flex-1 truncate">
                          {user?.stripe_customer_id || '—'}
                        </code>
                        {user?.stripe_customer_id && (
                          <button
                            onClick={() => handleCopy(user.stripe_customer_id!, 'customer-sub')}
                            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                            title="Copy Customer ID"
                          >
                            {copiedField === 'customer-sub' ? (
                              <Check className="w-3 h-3 text-green-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <Label className="text-sm text-gray-500">Subscription ID</Label>
                    {editingStripeIds ? (
                      <Input
                        value={stripeSubscriptionIdInput}
                        onChange={(e) => setStripeSubscriptionIdInput(e.target.value)}
                        placeholder="sub_..."
                        className="mt-1 font-mono text-sm"
                      />
                    ) : (
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-sm bg-gray-100 px-2 py-1 rounded flex-1 truncate">
                          {user?.stripe_subscription_id || '—'}
                        </code>
                        {user?.stripe_subscription_id && (
                          <button
                            onClick={() => handleCopy(user.stripe_subscription_id!, 'subscription-sub')}
                            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                            title="Copy Subscription ID"
                          >
                            {copiedField === 'subscription-sub' ? (
                              <Check className="w-3 h-3 text-green-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {editingStripeIds && (
                  <p className="text-xs text-amber-600 mt-3">
                    <AlertCircle className="w-3 h-3 inline mr-1" />
                    Changing Stripe IDs will affect billing sync. Ensure the IDs match valid Stripe records.
                  </p>
                )}
              </div>
            )}

            {/* Stripe Subscription Error Alert */}
            {stripeSubscriptionError && user?.stripe_subscription_id && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-800">Failed to load Stripe subscription data</p>
                    <p className="text-sm text-red-600 mt-1">{stripeSubscriptionError}</p>
                    <p className="text-xs text-red-500 mt-2">
                      Subscription ID: <code className="bg-red-100 px-1 rounded">{user.stripe_subscription_id}</code>
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      The data shown below is from the database, not from Stripe. Please verify in the Stripe dashboard.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold">Current Plan</h4>
                {user?.stripe_subscription_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={syncFromStripe}
                    disabled={isSyncingFromStripe || loadingStripeSubscription}
                    title="Sync database with actual Stripe subscription data"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${isSyncingFromStripe ? 'animate-spin' : ''}`} />
                    {isSyncingFromStripe ? 'Syncing...' : 'Sync from Stripe'}
                  </Button>
                )}
              </div>
              {loadingStripeSubscription ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  <span className="ml-2 text-gray-500">Loading subscription details...</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-2xl font-bold text-[#dd1969] capitalize">
                        {stripeSubscription?.planName || user?.subscription_tier || user?.plan_tier || 'None'}
                      </p>
                      {stripeSubscription ? (
                        <div className="space-y-1">
                          <p className="text-sm text-gray-600">
                            {stripeSubscription.discount ? (
                              <>
                                <span className="line-through text-gray-400">
                                  ${(stripeSubscription.listPrice / 100).toFixed(2)}
                                </span>
                                {' '}
                                <span className="text-green-600 font-medium">
                                  ${(stripeSubscription.actualAmount / 100).toFixed(2)}
                                </span>
                                /{stripeSubscription.billingInterval}
                              </>
                            ) : (
                              <>${(stripeSubscription.actualAmount / 100).toFixed(2)}/{stripeSubscription.billingInterval}</>
                            )}
                          </p>
                          {stripeSubscription.discount && (
                            <p className="text-xs text-green-600 font-medium">
                              Discount: {stripeSubscription.discount.code}
                              {stripeSubscription.discount.percentOff && ` (${stripeSubscription.discount.percentOff}% off)`}
                              {stripeSubscription.discount.amountOff && ` ($${(stripeSubscription.discount.amountOff / 100).toFixed(2)} off)`}
                              {stripeSubscription.discount.duration === 'forever' && ' - Forever'}
                              {stripeSubscription.discount.duration === 'repeating' && stripeSubscription.discount.durationInMonths && ` - ${stripeSubscription.discount.durationInMonths} months`}
                            </p>
                          )}
                        </div>
                      ) : (user?.subscription_tier || user?.plan_tier) &&
                       (user?.subscription_tier || user?.plan_tier)?.toLowerCase() !== 'free' && (
                        <p className="text-sm text-gray-600">
                          ${tierPrices[(user?.subscription_tier || user?.plan_tier)?.toLowerCase().replace(/\s+/g, '_') || '']?.annual || 0}/year
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge
                        className={
                          (user?.subscription_tier || user?.plan_tier)?.toLowerCase() === 'vip'
                            ? 'bg-yellow-100 text-yellow-800'
                            : (user?.subscription_tier || user?.plan_tier)?.toLowerCase() === 'elite'
                            ? 'bg-purple-100 text-purple-800'
                            : (user?.subscription_tier || user?.plan_tier)?.toLowerCase() === 'premium'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                        }
                      >
                        {user?.subscription_tier || user?.plan_tier || 'free'}
                      </Badge>
                      {(stripeSubscription?.status || user?.subscription_status) && (
                        <Badge
                          className={
                            (stripeSubscription?.status || user?.subscription_status) === 'active'
                              ? 'bg-green-100 text-green-800'
                              : (stripeSubscription?.status || user?.subscription_status) === 'trialing'
                              ? 'bg-blue-100 text-blue-800'
                              : (stripeSubscription?.status || user?.subscription_status) === 'past_due'
                              ? 'bg-red-100 text-red-800'
                              : (stripeSubscription?.status || user?.subscription_status) === 'canceled'
                              ? 'bg-gray-100 text-gray-800'
                              : (stripeSubscription?.status || user?.subscription_status) === 'paused'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                          }
                        >
                          {stripeSubscription?.status || user?.subscription_status}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Billing Period Info */}
                  {stripeSubscription && stripeSubscription.currentPeriodStart && stripeSubscription.currentPeriodEnd && (
                    <div className="grid grid-cols-2 gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-xs text-gray-500">Current Period</p>
                        <p className="text-sm font-medium">
                          {stripeSubscription.currentPeriodStart ? new Date(stripeSubscription.currentPeriodStart).toLocaleDateString() : ''} - {stripeSubscription.currentPeriodEnd ? new Date(stripeSubscription.currentPeriodEnd).toLocaleDateString() : ''}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">
                          {stripeSubscription.status === 'canceled' || stripeSubscription.cancelAtPeriodEnd
                            ? 'Plan End Date'
                            : stripeSubscription.status === 'trialing'
                            ? 'Trial Ends'
                            : 'Next Billing'}
                        </p>
                        <p className="text-sm font-medium">
                          {stripeSubscription.status === 'canceled' ? (
                            <span className="text-red-600">
                              Canceled {stripeSubscription.canceledAt
                                ? new Date(stripeSubscription.canceledAt).toLocaleDateString()
                                : stripeSubscription.currentPeriodEnd
                                  ? new Date(stripeSubscription.currentPeriodEnd).toLocaleDateString()
                                  : ''}
                            </span>
                          ) : stripeSubscription.cancelAtPeriodEnd ? (
                            <span className="text-red-600">Cancels {stripeSubscription.currentPeriodEnd ? new Date(stripeSubscription.currentPeriodEnd).toLocaleDateString() : ''}</span>
                          ) : stripeSubscription.trialEnd && stripeSubscription.status === 'trialing' ? (
                            <span className="text-blue-600">{new Date(stripeSubscription.trialEnd).toLocaleDateString()}</span>
                          ) : (
                            stripeSubscription.currentPeriodEnd ? new Date(stripeSubscription.currentPeriodEnd).toLocaleDateString() : ''
                          )}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Canceled/Pending Cancellation Alert */}
                  {stripeSubscription && (stripeSubscription.status === 'canceled' || stripeSubscription.cancelAtPeriodEnd) && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                      <p className="text-sm font-semibold text-red-800">
                        {stripeSubscription.status === 'canceled'
                          ? 'Subscription Canceled'
                          : 'Scheduled for Cancellation'}
                      </p>
                      <p className="text-xs text-red-600 mt-1">
                        {stripeSubscription.status === 'canceled'
                          ? `Access ended ${stripeSubscription.canceledAt
                              ? new Date(stripeSubscription.canceledAt).toLocaleDateString()
                              : 'on cancellation date'}`
                          : `Access will end on ${stripeSubscription.currentPeriodEnd ? new Date(stripeSubscription.currentPeriodEnd).toLocaleDateString() : 'end of billing period'}`}
                      </p>
                    </div>
                  )}

                  {user?.subscription_end_date && !stripeSubscription && (
                    <div className="space-y-2 mb-4">
                      <Label htmlFor="subscription_end_date">Subscription End Date</Label>
                      <Input
                        id="subscription_end_date"
                        type="date"
                        value={user.subscription_end_date ? new Date(user.subscription_end_date).toISOString().split('T')[0] : ''}
                        readOnly
                        className="bg-gray-50 cursor-not-allowed"
                      />
                      <p className="text-xs text-gray-500">
                        This date is automatically managed by Stripe and cannot be edited manually.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Change Plan Section */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold mb-4">Change Plan</h4>

              {/* Billing Interval Toggle */}
              <div className="flex items-center justify-center gap-4 mb-4">
                <span className={`text-sm font-medium ${selectedBillingInterval === 'monthly' ? 'text-gray-900' : 'text-gray-500'}`}>
                  Monthly
                </span>
                <button
                  onClick={() => setSelectedBillingInterval(selectedBillingInterval === 'monthly' ? 'annual' : 'monthly')}
                  className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-[#dd1969] focus:ring-offset-2"
                >
                  <span
                    className={`${
                      selectedBillingInterval === 'annual' ? 'translate-x-6' : 'translate-x-1'
                    } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                  />
                </button>
                <span className={`text-sm font-medium ${selectedBillingInterval === 'annual' ? 'text-gray-900' : 'text-gray-500'}`}>
                  Annual
                </span>
              </div>

              {/* Coupon Code Section */}
              <div className="space-y-2 mb-4">
                <Label htmlFor="coupon_code">Coupon Code</Label>
                {loadingCoupons ? (
                  <p className="text-sm text-gray-500">Loading coupons...</p>
                ) : availableCoupons.length > 0 ? (
                  <select
                    id="coupon_code"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b1554]"
                  >
                    <option value="">Select a coupon...</option>
                    {availableCoupons.map((coupon) => (
                      <option key={coupon.id} value={coupon.code}>
                        {coupon.code} - {coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` : `$${coupon.discount_value}`} off
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-gray-500">No active coupons available. Create coupons in the Coupons page.</p>
                )}
                {couponCode && (
                  <p className="text-xs text-green-600">
                    Coupon "{couponCode}" will be applied at checkout
                  </p>
                )}
              </div>

              {/* Plan Buttons */}
              {(() => {
                // Determine which plans to show based on user role
                const isProcessor = user?.role === 'processor'
                const availablePlans = isProcessor ? processorPlans : loPlans

                return (
                  <div className="grid gap-3 grid-cols-3">
                    {availablePlans.map((plan) => {
                      const currentPlanKey = (user?.subscription_tier?.toLowerCase() || user?.plan_tier?.toLowerCase() || 'free') as string
                      const currentTier = PLAN_HIERARCHY[currentPlanKey] ?? 0

                      const targetPlanKey = plan.id.toLowerCase()
                      const targetTier = PLAN_HIERARCHY[targetPlanKey] ?? 0

                      const isCurrentPlan = currentPlanKey === plan.id.toLowerCase() ||
                        user?.subscription_tier?.toLowerCase() === plan.id.toLowerCase() ||
                        user?.plan_tier?.toLowerCase() === plan.id.toLowerCase()

                      // Check if subscription is canceled/inactive - if so, allow all plans including current
                      const isSubscriptionCanceled = user?.subscription_status === 'canceled' ||
                        user?.subscription_status === 'inactive' ||
                        stripeSubscription?.status === 'canceled' ||
                        !user?.stripe_subscription_id

                      // Only disable the current plan button if there's an active subscription
                      const isDisabled = (isCurrentPlan && !isSubscriptionCanceled) || isUpgrading

                      let actionText = ''

                      if (isCurrentPlan && !isSubscriptionCanceled) {
                        actionText = 'Current'
                      } else if (isCurrentPlan && isSubscriptionCanceled) {
                        actionText = 'Reactivate'
                      } else if (targetTier > currentTier) {
                        actionText = 'Upgrade'
                      } else if (targetTier < currentTier) {
                        actionText = 'Downgrade'
                      } else {
                        actionText = 'Switch'
                      }

                      const price = tierPrices[plan.id]

                      return (
                        <Button
                          key={plan.id}
                          onClick={() => handleUpgradeDowngradeClick(plan.id, plan.name, plan.tier)}
                          disabled={isDisabled}
                          className={`flex flex-col items-center gap-1 h-auto py-3 px-2 ${
                            isDisabled
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60'
                              : targetTier > currentTier
                              ? 'bg-[#dd1969] hover:bg-[#c01559]'
                              : 'bg-gray-500 hover:bg-gray-600'
                          }`}
                        >
                          {isUpgrading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <span className="font-semibold text-sm">{plan.name}</span>
                              {price && (
                                <span className="text-xs">
                                  ${selectedBillingInterval === 'annual' ? price.annual : price.monthly}/{selectedBillingInterval === 'annual' ? 'yr' : 'mo'}
                                </span>
                              )}
                              <span className="text-xs font-normal">{actionText}</span>
                            </>
                          )}
                        </Button>
                      )
                    })}
                  </div>
                )
              })()}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
                <p className="text-xs text-blue-800">
                  <strong>Note:</strong> Clicking a plan button will process the subscription change through Stripe and charge the user accordingly.
                </p>
              </div>
            </div>

            {/* Payment Method */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold mb-4">Payment Method</h4>
              {loadingStripeSubscription ? (
                <p className="text-sm text-gray-500">Loading...</p>
              ) : (paymentMethod || customerPaymentMethod) ? (
                <div>
                  {(() => {
                    const card = paymentMethod || customerPaymentMethod
                    return (
                      <>
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg mb-3">
                          <CreditCard className="w-8 h-8 text-gray-400" />
                          <div className="flex-1">
                            <p className="font-medium">
                              {card.brand?.toUpperCase()} •••• {card.last4}
                            </p>
                            <p className="text-sm text-gray-600">
                              Expires {card.expMonth || card.exp_month}/{card.expYear || card.exp_year}
                            </p>
                          </div>
                        </div>

                        {/* Use existing card checkbox - only show if no active subscription */}
                        {!stripeSubscription && (
                          <div className="flex items-center gap-2 mb-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                            <input
                              type="checkbox"
                              id="use_existing_card"
                              checked={useExistingCard}
                              onChange={(e) => setUseExistingCard(e.target.checked)}
                              className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                            />
                            <label htmlFor="use_existing_card" className="text-sm text-green-800 cursor-pointer">
                              <strong>Use this card</strong> for new subscription (no checkout required)
                            </label>
                          </div>
                        )}
                      </>
                    )
                  })()}
                  <Button
                    onClick={handleUpdateCard}
                    disabled={isSubmitting}
                    variant="outline"
                    className="w-full"
                  >
                    Update Payment Method
                  </Button>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-gray-500 mb-3">No payment method on file</p>
                  <Button
                    onClick={handleUpdateCard}
                    disabled={isSubmitting}
                    className="w-full bg-[#dd1969] hover:bg-[#c01559]"
                  >
                    Add Payment Method
                  </Button>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 bg-[#dd1969] hover:bg-[#c01559]"
              >
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
              {user?.subscription_tier && user.subscription_tier !== 'free' && (
                <Button
                  variant="destructive"
                  onClick={handleCancelSubscriptionClick}
                  disabled={isSubmitting}
                >
                  Cancel Subscription
                </Button>
              )}
            </div>
          </TabsContent>

          {/* Escalations Tab */}
          <TabsContent value="escalations" className="space-y-4">
            <div className="border border-gray-200 rounded-lg p-6 text-center">
              <h4 className="font-semibold mb-2">Escalations Remaining</h4>
              <div className="text-5xl font-bold text-[#dd1969] mb-4">
                {formData.escalations_remaining >= 9999 ? 'Unlimited' : formData.escalations_remaining}
              </div>

              <div className="flex items-center justify-center gap-4 mb-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => adjustEscalations(-1)}
                  disabled={formData.escalations_remaining === 0}
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <Input
                  type="number"
                  value={formData.escalations_remaining}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      escalations_remaining: Math.max(0, parseInt(e.target.value) || 0),
                    })
                  }
                  className="w-24 text-center"
                  min="0"
                />
                <Button variant="outline" size="sm" onClick={() => adjustEscalations(1)}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <div className="text-sm text-gray-600 space-y-1">
                <p>• VIP: Unlimited</p>
                <p>• Elite: 6 per year</p>
                <p>• Premium: 1 per year</p>
                <p>• Free: 0</p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> Escalations reset annually based on the user's plan tier.
                Manual adjustments override the automatic reset.
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 bg-[#dd1969] hover:bg-[#c01559]"
              >
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>

      {/* Cancel Subscription Confirmation */}
      <AlertDialog open={cancelSubDialogOpen} onOpenChange={setCancelSubDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              Do you want to cancel the subscription for {user?.email}? Choose how to cancel:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => handleCancelSubscription(false)}
              disabled={isSubmitting}
            >
              Cancel at Period End
            </Button>
            <AlertDialogAction
              onClick={() => handleCancelSubscription(true)}
              disabled={isSubmitting}
              className="bg-red-600 hover:bg-red-700"
            >
              Cancel Immediately
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Upgrade/Downgrade Confirmation with Invoice Preview */}
      <AlertDialog open={upgradeDialogOpen} onOpenChange={setUpgradeDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingPlanChange ? `${getActionText(pendingPlanChange.id).charAt(0).toUpperCase() + getActionText(pendingPlanChange.id).slice(1)} Plan?` : 'Change Plan?'}
            </AlertDialogTitle>
          </AlertDialogHeader>

          {/* Invoice Preview */}
          {pendingPlanChange && (() => {
            const plan = allDynamicPlans.find(p => p.id === pendingPlanChange.id)
            const price = plan ? (selectedBillingInterval === 'monthly' ? plan.monthlyPrice : plan.annualPrice) : 0
            const selectedCoupon = availableCoupons.find(c => c.code === couponCode)
            let discountAmount = 0
            let discountLabel = ''

            if (selectedCoupon) {
              if (selectedCoupon.percent_off) {
                discountAmount = Math.round(price * selectedCoupon.percent_off / 100)
                discountLabel = `${selectedCoupon.percent_off}% off`
              } else if (selectedCoupon.amount_off) {
                discountAmount = selectedCoupon.amount_off / 100
                discountLabel = `$${discountAmount} off`
              }
            }

            const total = price - discountAmount
            const hasExistingSubscription = !!stripeSubscription

            return (
              <div className="space-y-4 py-4">
                {/* Invoice Details */}
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{pendingPlanChange.name} ({selectedBillingInterval})</span>
                    <span className="font-medium">${price.toFixed(2)}</span>
                  </div>

                  {selectedCoupon && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Discount ({discountLabel})</span>
                      <span>-${discountAmount.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="border-t pt-2 flex justify-between font-semibold">
                    <span>Total</span>
                    <span>${total.toFixed(2)}/{selectedBillingInterval === 'monthly' ? 'mo' : 'yr'}</span>
                  </div>
                </div>

                {/* Card on File Info */}
                {(paymentMethod || customerPaymentMethod) && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <CreditCard className="w-4 h-4" />
                    <span>
                      {(paymentMethod || customerPaymentMethod).brand?.toUpperCase()} •••• {(paymentMethod || customerPaymentMethod).last4}
                    </span>
                  </div>
                )}

                {/* Billing Option - Only show for existing subscriptions */}
                {hasExistingSubscription && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Billing Option</Label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="billOption"
                          checked={billImmediately}
                          onChange={() => setBillImmediately(true)}
                          className="w-4 h-4 text-[#dd1969]"
                        />
                        <span className="text-sm">Bill immediately (prorate current period)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="billOption"
                          checked={!billImmediately}
                          onChange={() => setBillImmediately(false)}
                          className="w-4 h-4 text-[#dd1969]"
                        />
                        <span className="text-sm">Schedule for next billing cycle</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Proration Preview - Only show when billing immediately */}
                {hasExistingSubscription && billImmediately && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    {loadingProration ? (
                      <div className="flex items-center gap-2 text-sm text-blue-700">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Calculating proration...
                      </div>
                    ) : prorationPreview ? (
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-blue-900">Proration Preview</p>
                        {prorationPreview.prorationCredit > 0 && (
                          <div className="flex justify-between text-sm text-blue-700">
                            <span>Credit for unused time</span>
                            <span className="text-green-600">-${(prorationPreview.prorationCredit / 100).toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm font-semibold text-blue-900 pt-1 border-t border-blue-200">
                          <span>Amount due today</span>
                          <span>${(prorationPreview.amountDue / 100).toFixed(2)}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-blue-700">
                        The user will be charged a prorated amount for the upgrade immediately.
                      </p>
                    )}
                  </div>
                )}

                {/* Info Message */}
                <p className="text-xs text-gray-500">
                  {hasExistingSubscription
                    ? billImmediately
                      ? prorationPreview
                        ? `Card ending in ${(paymentMethod || customerPaymentMethod)?.last4 || '****'} will be charged.`
                        : 'The user will be charged a prorated amount for the upgrade immediately.'
                      : 'The plan change will take effect at the start of the next billing cycle.'
                    : (paymentMethod || customerPaymentMethod)
                      ? 'The saved card will be charged for the new subscription.'
                      : 'A Stripe Checkout link will be generated for the user to complete payment.'}
                </p>
              </div>
            )
          })()}

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingPlanChange(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUpgradeDowngrade}
              className="bg-[#dd1969] hover:bg-[#c01559]"
            >
              {pendingPlanChange ? `${getActionText(pendingPlanChange.id).charAt(0).toUpperCase() + getActionText(pendingPlanChange.id).slice(1)} Plan` : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
