import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'
import { VendorDetailClient } from './VendorDetailClient'
import { VendorResourcesCarousel } from './VendorResourcesCarousel'
import { notFound } from 'next/navigation'
import { getViewAsSettings, applyViewAsOverride } from '@/lib/view-as-server'
import { UpgradeBanner } from '@/components/ui/upgrade-banner'
import { ViewTracker } from '@/components/analytics/ViewTracker'
import { getImageUrl } from '@/lib/utils/image'

interface VendorDetailPageProps {
  params: Promise<{ slug: string }>
}

export default async function VendorDetailPage({ params }: VendorDetailPageProps) {
  const { slug } = await params
  const supabase = await createClient()

  // Fetch vendor from database
  const { data: vendor, error } = await supabase
    .from('vendors')
    .select(`
      *,
      category:category_id (
        id,
        name,
        slug,
        color
      )
    `)
    .eq('slug', slug)
    .single()

  // Get current user for access control
  const { data: { user } } = await supabase.auth.getUser()
  let { data: profile } = await supabase
    .from('profiles')
    .select('role, plan_tier, is_admin')
    .eq('id', user?.id)
    .single()

  // Apply view-as override if active
  const viewAsSettings = await getViewAsSettings()
  profile = applyViewAsOverride(profile, viewAsSettings)

  if (error || !vendor) {
    notFound()
  }

  // Check if user has access (admins and partners bypass)
  const isPartner = profile?.role === 'partner_vendor' || profile?.role === 'partner_lender'
  let hasAccess = true
  if (!profile?.is_admin && !isPartner) {
    // Premium Guest and Premium Processor Guest can ONLY access Core Vendor Partners
    const isGuestTier = profile?.plan_tier === 'Premium Guest' || profile?.plan_tier === 'Premium Processor Guest'
    if (isGuestTier) {
      hasAccess = vendor.is_core_partner === true
    } else {
      // Check plan tier access for other tiers
      const hasPlanAccess = !vendor.required_plan_tier ||
        vendor.required_plan_tier.length === 0 ||
        vendor.required_plan_tier.includes(profile?.plan_tier)

      hasAccess = hasPlanAccess
    }
  }

  // Fetch vendor resources (additional collateral)
  const { data: vendorResources } = await supabase
    .from('vendor_resources')
    .select('*')
    .eq('vendor_id', vendor.id)
    .order('display_order', { ascending: true })

  // If user doesn't have access, show upgrade banner
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Back Button */}
        <div className="px-4 md:px-8 py-4 bg-white border-b">
          <Link
            href="/dashboard/market"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back to market</span>
          </Link>
        </div>

        {/* Vendor Header with Basic Info */}
        <div className="px-4 md:px-8 py-6 md:py-8 bg-white">
          <div className="max-w-5xl mx-auto text-center">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
              {vendor.name}
            </h1>
            {vendor.category && (
              <Badge className="text-white mb-4" style={{ backgroundColor: vendor.category.color || '#0066cc' }}>
                {vendor.category.name}
              </Badge>
            )}
          </div>
        </div>

        {/* Upgrade Banner */}
        <div className="px-4 md:px-8 py-6 md:py-8">
          <UpgradeBanner
            requiredTiers={vendor.required_plan_tier || []}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Analytics View Tracking */}
      <ViewTracker
        contentType="vendor"
        contentId={vendor.id}
        contentTitle={vendor.name}
      />

      {/* Back Button */}
      <div className="px-4 md:px-8 py-4 bg-white border-b">
        <Link
          href="/dashboard/market"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Back to market</span>
        </Link>
      </div>

      {/* Vendor Header */}
      <div className="px-4 md:px-8 py-6 md:py-8 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row gap-6 items-start">
            {/* Logo */}
            <div className="w-full md:w-48 flex-shrink-0">
              <div className="relative w-full h-32 bg-white rounded-lg border-2 border-gray-200 overflow-hidden">
                <Image
                  src={getImageUrl(vendor.logo_url, 'detail') || 'https://placehold.co/300x150/0066cc/white?text=' + encodeURIComponent(vendor.name)}
                  alt={vendor.name}
                  fill
                  className="object-contain"
                />
              </div>
            </div>

            {/* Info and Actions */}
            <div className="flex-1">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
                    {vendor.name}
                  </h1>
                  {vendor.category && (
                    <Badge className="text-white mb-4" style={{ backgroundColor: vendor.category.color || '#0066cc' }}>
                      {vendor.category.name}
                    </Badge>
                  )}
                </div>

                {/* Action Buttons */}
                <VendorDetailClient
                  vendorId={vendor.id}
                  vendorName={vendor.name}
                  affiliateUrl={vendor.website_url || ''}
                  userRole={profile?.role}
                  showConnectButton={vendor.show_connect_button ?? true}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Vendor Content */}
      <div className="px-4 md:px-8 py-6 md:py-8">
        <div className="max-w-5xl mx-auto bg-white rounded-lg shadow-lg p-6 md:p-8">
          {/* Description */}
          {vendor.description && (
            <div className="mb-8">
              <div
                className="text-gray-700 leading-relaxed prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: vendor.description }}
              />
            </div>
          )}

          {/* Features */}
          {vendor.features && vendor.features.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Key Features
              </h3>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                {vendor.features.map((feature: string, index: number) => (
                  <li key={index} className="leading-relaxed">{feature}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Pricing Info */}
          {vendor.pricing_info && (
            <div className="mt-8 pt-8 border-t">
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Pricing Information
              </h3>
              <div
                className="text-gray-700 leading-relaxed prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: vendor.pricing_info }}
              />
            </div>
          )}

          {/* Additional Resources */}
          {vendorResources && vendorResources.length > 0 && (
            <div className="mt-8 pt-8 border-t">
              <h3 className="text-xl font-bold text-gray-900 mb-6">
                Additional Resources
              </h3>
              <VendorResourcesCarousel resources={vendorResources} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
