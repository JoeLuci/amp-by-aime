import { createClient } from '@/lib/supabase/server'
import { MarketClient } from './MarketClient'
import { getViewAsSettings, applyViewAsOverride } from '@/lib/view-as-server'
import { UpgradeBanner } from '@/components/ui/upgrade-banner'

// Revalidate every 5 minutes for market content
export const revalidate = 300

export default async function MarketPage() {
  const supabase = await createClient()

  // Get current user for access control
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch profile, view-as settings, and vendors in parallel
  const [
    { data: profileData },
    viewAsSettings,
    { data: vendorsData }
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('role, plan_tier, is_admin')
      .eq('id', user?.id)
      .single(),
    getViewAsSettings(),
    supabase
      .from('vendors')
      .select(`
        id,
        name,
        slug,
        logo_url,
        vendor_category,
        is_core_partner,
        is_affiliate,
        display_order,
        required_plan_tier,
        category:category_id (
          id,
          name,
          slug,
          color
        )
      `)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
  ])

  // Apply view-as override if active
  const profile = applyViewAsOverride(profileData, viewAsSettings)

  // Filter vendors based on user access
  const filteredVendors = (vendorsData || []).filter(vendor => {
    // Admins can see everything
    if (profile?.is_admin) {
      return true
    }

    // Partners (vendors/lenders) can see everything
    if (profile?.role === 'partner_vendor' || profile?.role === 'partner_lender') {
      return true
    }

    // Premium Guest and Premium Processor Guest can ONLY see Core Vendor Partners
    const isGuestTier = profile?.plan_tier === 'Premium Guest' || profile?.plan_tier === 'Premium Processor Guest'
    if (isGuestTier) {
      return vendor.is_core_partner === true
    }

    // Check plan tier access for other tiers
    const hasPlanAccess = !vendor.required_plan_tier ||
      vendor.required_plan_tier.length === 0 ||
      vendor.required_plan_tier.includes(profile?.plan_tier)

    return hasPlanAccess
  })

  const vendors = filteredVendors

  // Group vendors by category
  const vendorsByCategory: { category: string; vendors: any[] }[] = []

  // Core Vendor Partners
  const coreVendors = vendors
    .filter(v => v.is_core_partner)
    .map(v => {
      const categoryName = (v.category as any)?.name || 'Other'
      const categoryColor = (v.category as any)?.color || '#6b7280'
      return {
        id: v.id,
        name: v.name,
        logo: v.logo_url || '',
        tier: 'Core',
        category: categoryName,
        categoryColor: categoryColor,
        slug: v.slug
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  if (coreVendors.length > 0) {
    vendorsByCategory.push({
      category: 'Core Vendor Partner',
      vendors: coreVendors
    })
  }

  // Vendor Members & Partners (those that are not core or affiliate)
  const partnerVendors = vendors
    .filter(v => !v.is_core_partner && !v.is_affiliate)
    .map(v => {
      const categoryName = (v.category as any)?.name || 'Other'
      const categoryColor = (v.category as any)?.color || '#6b7280'
      return {
        id: v.id,
        name: v.name,
        logo: v.logo_url || '',
        tier: 'Partner',
        category: categoryName,
        categoryColor: categoryColor,
        slug: v.slug
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  if (partnerVendors.length > 0) {
    vendorsByCategory.push({
      category: 'Vendor Members & Partners',
      vendors: partnerVendors
    })
  }

  // Affiliates
  const affiliateVendors = vendors
    .filter(v => v.is_affiliate)
    .map(v => {
      const categoryName = (v.category as any)?.name || 'Other'
      const categoryColor = (v.category as any)?.color || '#6b7280'
      return {
        id: v.id,
        name: v.name,
        logo: v.logo_url || '',
        tier: 'Affiliate',
        category: categoryName,
        categoryColor: categoryColor,
        slug: v.slug
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  if (affiliateVendors.length > 0) {
    vendorsByCategory.push({
      category: 'Affiliates',
      vendors: affiliateVendors
    })
  }

  // Check if user is on a guest tier (for showing upgrade banner)
  const isGuestTier = !profile?.is_admin &&
    (profile?.plan_tier === 'Premium Guest' || profile?.plan_tier === 'Premium Processor Guest')

  return (
    <div className="min-h-screen">
      {/* Page Header */}
      <div className="px-4 md:px-8 py-6 md:py-8">
        <h1 className="text-3xl md:text-4xl font-bold text-[#dd1969] mb-2">
          MARKET
        </h1>
        <p className="text-gray-600 text-sm md:text-base">
          Get special offers with exclusive AIME deals
        </p>
      </div>

      {/* Vendors by Category with Filter */}
      <div className="px-4 md:px-8 pb-8">
        <MarketClient vendorsByCategory={vendorsByCategory} />

        {/* Upgrade Banner for Guest Tier Users */}
        {isGuestTier && (
          <div className="mt-8">
            <UpgradeBanner
              title="Upgrade for Access to More Vendor Discounts"
              description="Unlock exclusive deals from our full network of Vendor Members, Partners, and Affiliates with a paid membership."
              requiredTiers={['Premium', 'Elite', 'VIP']}
            />
          </div>
        )}
      </div>
    </div>
  )
}
