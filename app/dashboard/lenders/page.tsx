import { createClient } from '@/lib/supabase/server'
import { LendersClient } from './LendersClient'
import { getViewAsSettings, applyViewAsOverride } from '@/lib/view-as-server'

// Revalidate every 5 minutes for lender content
export const revalidate = 300

export default async function LendersPage() {
  const supabase = await createClient()

  // Get current user for access control
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch profile, view-as settings, and lenders in parallel
  const [
    { data: profileData },
    viewAsSettings,
    { data: lenders }
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('role, plan_tier, is_admin, escalations_remaining')
      .eq('id', user?.id)
      .single(),
    getViewAsSettings(),
    supabase
      .from('lenders')
      .select(`
        *,
        category:category_id (
          id,
          name,
          slug,
          color,
          display_order
        )
      `)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
  ])

  const sortedLenders = (lenders || []).slice().sort((a, b) => {
    const aCat = a.category?.display_order ?? Number.MAX_SAFE_INTEGER
    const bCat = b.category?.display_order ?? Number.MAX_SAFE_INTEGER
    if (aCat !== bCat) return aCat - bCat
    return (a.display_order ?? 0) - (b.display_order ?? 0)
  })

  // Apply view-as override if active
  const profile = applyViewAsOverride(profileData, viewAsSettings)

  // Filter lenders based on user access
  const filteredLenders = sortedLenders.filter(lender => {
    // Admins can see everything
    if (profile?.is_admin) {
      return true
    }

    // Partners (vendors/lenders) can see everything
    if (profile?.role === 'partner_vendor' || profile?.role === 'partner_lender') {
      return true
    }

    // Check plan tier access
    // Map "Premium Guest" to "Premium" for access checks
    const effectiveTier = profile?.plan_tier === 'Premium Guest' ? 'Premium' : profile?.plan_tier

    const hasPlanAccess = !lender.required_plan_tier ||
      lender.required_plan_tier.length === 0 ||
      lender.required_plan_tier.includes(effectiveTier)

    return hasPlanAccess
  })

  const formattedLenders = filteredLenders.map(lender => ({
    id: lender.id,
    name: lender.name,
    tier: lender.category?.name || lender.lender_type || 'Standard',
    logo: lender.logo_url || '/placeholder-logo.png',
    tierColor: lender.category?.color || '#94a3b8',
    slug: lender.slug,
    products: lender.products || []
  }))

  // Get unique products from all lenders
  const allProducts = new Set<string>()
  formattedLenders.forEach(lender => {
    lender.products.forEach((product: string) => allProducts.add(product))
  })
  const uniqueProducts = Array.from(allProducts).sort()

  return <LendersClient lenders={formattedLenders} products={uniqueProducts} planTier={profile?.plan_tier} escalationsRemaining={profile?.escalations_remaining} />
}
