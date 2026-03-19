'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { getImageUrl } from '@/lib/utils/image'

interface Vendor {
  id: string
  name: string
  tier: string
  category: string
  categoryColor: string
  logo: string
  slug: string
}

interface VendorCategory {
  category: string
  vendors: Vendor[]
}

interface MarketClientProps {
  vendorsByCategory: VendorCategory[]
}

type FilterOption = 'all' | 'core' | 'members' | 'affiliates'

export function MarketClient({ vendorsByCategory }: MarketClientProps) {
  const [filter, setFilter] = useState<FilterOption>('all')

  // Filter vendors based on selected option
  const filteredVendorsByCategory = useMemo(() => {
    if (filter === 'all') {
      return vendorsByCategory
    }

    return vendorsByCategory.filter(({ category }) => {
      if (filter === 'core') return category === 'Core Vendor Partner'
      if (filter === 'members') return category === 'Vendor Members & Partners'
      if (filter === 'affiliates') return category === 'Affiliates'
      return true
    })
  }, [vendorsByCategory, filter])

  // Calculate total vendors shown
  const totalVendors = filteredVendorsByCategory.reduce(
    (acc, { vendors }) => acc + vendors.length,
    0
  )

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">Filter:</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterOption)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#dd1969]"
          >
            <option value="all">View All</option>
            <option value="core">Core Partners</option>
            <option value="members">Vendor Members</option>
            <option value="affiliates">Affiliates</option>
          </select>
        </div>
        <p className="text-sm text-gray-600">
          Showing <span className="font-semibold">{totalVendors}</span> vendors
        </p>
      </div>

      {/* Vendor Categories */}
      <div className="space-y-8">
        {filteredVendorsByCategory.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No vendors found for this filter
          </div>
        ) : (
          filteredVendorsByCategory.map(({ category, vendors }) => (
            <div key={category}>
              {/* Category Header */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">{category}</h2>
                <div className="flex gap-2">
                  <button className="text-gray-400 hover:text-gray-600">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button className="text-gray-400 hover:text-gray-600">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Vendor Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {vendors.map((vendor) => (
                  <Link
                    key={vendor.id}
                    href={`/dashboard/market/${vendor.slug}`}
                    className="group"
                  >
                    <div className="relative bg-white rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-all hover:-translate-y-1 aspect-[4/3] flex flex-col">
                      {/* Category Badge - Positioned on Top */}
                      <div
                        className="py-1.5 text-center text-xs font-semibold text-white z-10 rounded-t-lg"
                        style={{ backgroundColor: vendor.categoryColor }}
                      >
                        {vendor.category || 'Uncategorized'}
                      </div>

                      {/* Logo - Fill remaining space below badge */}
                      <div className="flex-1 relative bg-white">
                        <Image
                          src={getImageUrl(vendor.logo, 'card')}
                          alt={vendor.name}
                          fill
                          className="object-contain"
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                          loading="lazy"
                        />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
