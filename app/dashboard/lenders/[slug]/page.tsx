import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'
import { LenderDetailClient } from './LenderDetailClient'
import { notFound } from 'next/navigation'
import { getViewAsSettings, applyViewAsOverride } from '@/lib/view-as-server'
import { UpgradeBanner } from '@/components/ui/upgrade-banner'
import { ViewTracker } from '@/components/analytics/ViewTracker'
import { getImageUrl } from '@/lib/utils/image'

interface LenderDetailPageProps {
  params: Promise<{ slug: string }>
}

export default async function LenderDetailPage({ params }: LenderDetailPageProps) {
  const { slug } = await params
  const supabase = await createClient()

  // Fetch lender from database with category info
  const { data: lender, error } = await supabase
    .from('lenders')
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
    .select('role, plan_tier, is_admin, escalations_remaining')
    .eq('id', user?.id)
    .single()

  // Apply view-as override if active
  const viewAsSettings = await getViewAsSettings()
  profile = applyViewAsOverride(profile, viewAsSettings)

  if (error || !lender) {
    notFound()
  }

  // Check if user has access (admins and partners bypass)
  const isPartner = profile?.role === 'partner_vendor' || profile?.role === 'partner_lender'
  let hasAccess = true
  if (!profile?.is_admin && !isPartner) {
    // Map "Premium Guest" to "Premium" for access checks
    const effectiveTier = profile?.plan_tier === 'Premium Guest' ? 'Premium' : profile?.plan_tier

    const hasPlanAccess = !lender.required_plan_tier ||
      lender.required_plan_tier.length === 0 ||
      lender.required_plan_tier.includes(effectiveTier)

    hasAccess = hasPlanAccess
  }

  // If user doesn't have access, show upgrade banner
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Back Button */}
        <div className="px-4 md:px-8 py-4 bg-white border-b">
          <Link
            href="/dashboard/lenders"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back to lenders</span>
          </Link>
        </div>

        {/* Lender Header with Basic Info */}
        <div className="px-4 md:px-8 py-6 md:py-8 bg-white">
          <div className="max-w-5xl mx-auto text-center">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
              {lender.name}
            </h1>
            {(lender.category?.name || lender.lender_type) && (
              <Badge
                className="text-white mb-4"
                style={{ backgroundColor: lender.category?.color || '#94a3b8' }}
              >
                {lender.category?.name || lender.lender_type}
              </Badge>
            )}
          </div>
        </div>

        {/* Upgrade Banner */}
        <div className="px-4 md:px-8 py-6 md:py-8">
          <UpgradeBanner
            requiredTiers={lender.required_plan_tier || []}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Analytics Tracking */}
      <ViewTracker
        contentType="lender"
        contentId={lender.id}
        contentTitle={lender.name}
      />

      {/* Back Button */}
      <div className="px-4 md:px-8 py-4">
        <Link
          href="/dashboard/lenders"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Back to lenders</span>
        </Link>
      </div>

      {/* Lender Header */}
      <div className="px-4 md:px-8 pb-6">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex flex-col md:flex-row gap-8 items-start">
            {/* Logo */}
            <div className="w-full md:w-64 flex-shrink-0">
              <div className="relative w-full h-32 bg-white rounded-lg border-2 border-gray-200 overflow-hidden">
                <Image
                  src={getImageUrl(lender.logo_url, 'detail') || 'https://placehold.co/300x150/0066cc/white?text=' + encodeURIComponent(lender.name)}
                  alt={lender.name}
                  fill
                  className="object-contain"
                />
              </div>
              {(lender.category?.name || lender.lender_type) && (
                <div className="mt-4">
                  <Badge
                    className="text-white"
                    style={{ backgroundColor: lender.category?.color || '#94a3b8' }}
                  >
                    {lender.category?.name || lender.lender_type}
                  </Badge>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">
                {lender.name}
              </h1>
              {lender.description && (
                <p className="text-gray-600 mb-6 whitespace-pre-line">
                  {lender.description}
                </p>
              )}

              {/* Links Section */}
              <div className="mb-6">
                <h3 className="font-semibold text-lg mb-3">Links</h3>
                <LenderDetailClient lenderId={lender.id} planTier={profile?.plan_tier} userRole={profile?.role} escalationsRemaining={profile?.escalations_remaining} />
              </div>

              {/* Products */}
              {lender.products && lender.products.length > 0 && (
                <div className="mb-6">
                  <h3 className="font-semibold text-lg mb-3">Product Offerings</h3>
                  <div className="flex flex-wrap gap-2">
                    {lender.products.map((product: string) => (
                      <Badge key={product} variant="secondary" className="bg-[#25314e] text-white">
                        {product}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Features */}
              {lender.features && lender.features.length > 0 && (
                <div>
                  <h3 className="font-semibold text-lg mb-3">Key Features</h3>
                  <ul className="list-disc list-inside space-y-2 text-gray-700">
                    {lender.features.map((feature: string, index: number) => (
                      <li key={index}>{feature}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
