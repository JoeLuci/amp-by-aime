'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import Image from 'next/image'
import Link from 'next/link'
import { getImageUrl } from '@/lib/utils/image'

interface Lender {
  id: string
  name: string
  tier: string
  logo: string
  tierColor: string
  slug: string
  products: string[]
}

interface LendersClientProps {
  lenders: Lender[]
  products: string[]
  planTier?: string
  escalationsRemaining?: number
}

export function LendersClient({ lenders, products, planTier, escalationsRemaining }: LendersClientProps) {
  const [selectedProduct, setSelectedProduct] = useState<string>('')

  // Premium Guest users cannot escalate loans, also need remaining escalations
  const canEscalate = planTier !== 'Premium Guest' && (escalationsRemaining ?? 0) > 0

  const handleConnectClick = (lenderSlug: string, e: React.MouseEvent) => {
    e.preventDefault()
    // Navigate to lender detail page with modal query param
    window.location.href = `/dashboard/lenders/${lenderSlug}?modal=connect`
  }

  const handleEscalateClick = (lenderSlug: string, e: React.MouseEvent) => {
    e.preventDefault()
    // Navigate to lender detail page with modal query param
    window.location.href = `/dashboard/lenders/${lenderSlug}?modal=escalate`
  }

  const handleProductChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedProduct(e.target.value)
  }

  // Filter lenders by product
  const filteredLenders = selectedProduct
    ? lenders.filter(lender => lender.products.includes(selectedProduct))
    : lenders

  return (
    <div className="min-h-screen">
      {/* Page Header */}
      <div className="px-4 md:px-8 py-6 md:py-8">
        <h1 className="text-3xl md:text-4xl font-bold text-[#dd1969] mb-2">
          LENDERS
        </h1>
        <p className="text-gray-600 text-sm md:text-base">
          Connect with our AIME lender partners
        </p>

        {/* Filter Bar */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mt-6">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">Filter:</span>
            <select
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#dd1969]"
              value={selectedProduct}
              onChange={handleProductChange}
            >
              <option value="">All Products</option>
              {products.map((product) => (
                <option key={product} value={product}>
                  {product}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm text-gray-600">
            Showing <span className="font-semibold">{filteredLenders.length}</span> lenders
          </p>
        </div>
      </div>

      {/* Lenders Grid */}
      <div className="px-4 md:px-8 pb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredLenders.map((lender) => (
          <div
            key={lender.id}
            className="bg-white rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-shadow flex flex-col"
          >
            {/* Logo Section - Clickable to detail page */}
            <Link href={`/dashboard/lenders/${lender.slug}`} className="relative aspect-[4/3] flex-shrink-0">
              {/* Logo - Full Container with Padding */}
              <div className="absolute inset-0 p-6 flex items-center justify-center bg-white hover:bg-gray-50 transition-colors">
                <div className="relative w-full h-full">
                  <Image
                    src={getImageUrl(lender.logo, 'card')}
                    alt={lender.name}
                    fill
                    className="object-contain"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                    loading="lazy"
                  />
                </div>
              </div>

              {/* Tier Badge - Positioned on Top */}
              <div
                className="absolute top-0 left-0 right-0 text-white text-center py-2 text-sm font-semibold"
                style={{ backgroundColor: lender.tierColor }}
              >
                {lender.tier}
              </div>
            </Link>

            {/* Action Buttons */}
            <div className="p-4 space-y-2">
              <Button
                onClick={(e) => handleConnectClick(lender.slug, e)}
                className="w-full bg-[#25314e] hover:bg-[#1a233a] text-white font-semibold rounded-full"
              >
                Connect
              </Button>
              {canEscalate && (
                <Button
                  onClick={(e) => handleEscalateClick(lender.slug, e)}
                  className="w-full bg-[#dd1969] hover:bg-[#c01559] text-white font-semibold rounded-full"
                >
                  Escalate Loan
                </Button>
              )}
            </div>
          </div>
        ))}
        </div>
      </div>
    </div>
  )
}
