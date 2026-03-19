'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { getImageUrl } from '@/lib/utils/image'

interface FeaturedItem {
  id: string
  title: string
  logo?: string
  slug?: string
  type?: 'vendor' | 'lender'
}

interface FeaturedCarouselProps {
  items: FeaturedItem[]
}

export function FeaturedCarousel({ items }: FeaturedCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)

  if (!items || items.length === 0) {
    return (
      <div className="bg-gradient-to-r from-[#20adce] to-[#1a8ba8] rounded-lg p-4 md:p-8">
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-4 md:mb-6">Featured</h2>
        <div className="grid grid-cols-3 gap-8 md:gap-12 max-w-4xl mx-auto">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white rounded-xl aspect-square flex items-center justify-center"
            >
              <p className="text-gray-400 text-center text-sm md:text-base p-4">Partner {i}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const goToPrevious = () => {
    setCurrentIndex((prevIndex) => {
      if (prevIndex === 0) {
        return items.length - 1
      }
      return prevIndex - 1
    })
  }

  const goToNext = () => {
    setCurrentIndex((prevIndex) => {
      if (prevIndex >= items.length - 1) {
        return 0
      }
      return prevIndex + 1
    })
  }

  // Get current 3 items with wrapping for infinite scroll
  const getVisibleItems = () => {
    const visible = []
    for (let i = 0; i < 3; i++) {
      const index = (currentIndex + i) % items.length
      visible.push(items[index])
    }
    return visible
  }

  const currentItems = getVisibleItems()
  const totalPages = items.length

  return (
    <div className="bg-gradient-to-r from-[#20adce] to-[#1a8ba8] rounded-lg p-4 md:p-8">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h2 className="text-2xl md:text-3xl font-bold text-white">Featured</h2>

        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={goToPrevious}
              className="bg-white hover:bg-gray-100 rounded-full p-2 transition-all"
              aria-label="Previous"
            >
              <ChevronLeft className="w-5 h-5 text-gray-900" />
            </button>
            <button
              onClick={goToNext}
              className="bg-white hover:bg-gray-100 rounded-full p-2 transition-all"
              aria-label="Next"
            >
              <ChevronRight className="w-5 h-5 text-gray-900" />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-8 md:gap-12 max-w-4xl mx-auto">
        {currentItems.map((item, idx) => {
          const href = item.type && item.slug
            ? `/dashboard/${item.type === 'vendor' ? 'vendors' : 'lenders'}/${item.slug}`
            : '#'

          return (
            <Link
              key={`${item.id}-${idx}`}
              href={href}
              className="bg-white rounded-xl aspect-square relative cursor-pointer transition-all duration-200 hover:shadow-xl hover:scale-105 block"
            >
              {item.logo ? (
                <Image
                  src={getImageUrl(item.logo, 'featured')}
                  alt={item.title}
                  fill
                  className="object-contain p-6 md:p-8"
                  sizes="(max-width: 640px) 33vw, 20vw"
                  priority={idx < 3}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center p-4">
                  <p className="text-gray-900 font-semibold text-center text-sm md:text-base">{item.title}</p>
                </div>
              )}
            </Link>
          )
        })}
      </div>

      {items.length > 3 && (
        <div className="flex justify-center gap-2 mt-4">
          {items.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`w-2 h-2 rounded-full transition-all ${
                index === currentIndex
                  ? 'bg-white w-8'
                  : 'bg-white/50 hover:bg-white/75'
              }`}
              aria-label={`Go to item ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
