import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FuseClaimPage } from '@/components/dashboard/FuseClaimPage'
import { getImpersonationSettings } from '@/lib/impersonation-server'
import { getViewAsSettings } from '@/lib/view-as-server'

export default async function FuseRegistrationPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/sign-in')
  }

  // Check for impersonation mode
  const impersonationSettings = await getImpersonationSettings()
  const isImpersonating = impersonationSettings?.isImpersonating && impersonationSettings?.impersonatedUserId
  const effectiveUserId = isImpersonating ? impersonationSettings.impersonatedUserId : user.id

  const viewAsSettings = await getViewAsSettings()
  const isAdminPreview = !!(isImpersonating || viewAsSettings?.isViewingAs)

  // Get user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, phone, company, plan_tier, fuse_ticket_claimed_year, gender, is_admin')
    .eq('id', effectiveUserId)
    .single()

  if (!profile) {
    redirect('/dashboard')
  }

  const isAdmin = profile.is_admin === true

  // Admin-only for now — not live for members yet
  if (!isAdmin) {
    redirect('/dashboard')
  }

  const eligibleTiers = ['Premium', 'Elite', 'VIP']

  // Get active Fuse event
  const { data: activeEvent } = await supabase
    .from('fuse_events')
    .select('*')
    .eq('is_active', true)
    .single()

  if (!activeEvent) {
    redirect('/dashboard')
  }

  // Check for existing registration
  const { data: existingRegistration } = await supabase
    .from('fuse_registrations')
    .select('id, ticket_type, has_hall_of_aime, has_wmn_at_fuse')
    .eq('fuse_event_id', activeEvent.id)
    .eq('user_id', effectiveUserId)
    .single()

  // Fetch tier-specific prices + universal add-ons (tier IS NULL, like WMN)
  const effectiveTier = profile.plan_tier && eligibleTiers.includes(profile.plan_tier)
    ? profile.plan_tier
    : isAdmin ? 'Premium' : null

  const { data: tierPrices } = await supabase
    .from('fuse_ticket_prices')
    .select('*')
    .eq('fuse_event_id', activeEvent.id)
    .eq('tier', effectiveTier)
    .eq('is_active', true)
    .order('sort_order')

  // Also fetch universal add-ons (tier = null, is_addon = true) that aren't already covered by tier prices
  const { data: universalAddons } = await supabase
    .from('fuse_ticket_prices')
    .select('*')
    .eq('fuse_event_id', activeEvent.id)
    .is('tier', null)
    .eq('is_addon', true)
    .eq('is_active', true)
    .order('sort_order')

  // Merge: tier prices + universal add-ons not already in tier prices
  const tierProductKeys = (tierPrices || []).map((p) => p.product_key)
  const mergedPrices = [
    ...(tierPrices || []),
    ...(universalAddons || []).filter((a) => !tierProductKeys.includes(a.product_key)),
  ]

  return (
    <FuseClaimPage
      event={activeEvent}
      userProfile={{
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        phone: profile.phone,
        company: profile.company,
        plan_tier: profile.plan_tier,
        gender: profile.gender,
      }}
      existingRegistration={existingRegistration}
      isAdmin={isAdmin}
      tierPrices={mergedPrices}
    />
  )
}
