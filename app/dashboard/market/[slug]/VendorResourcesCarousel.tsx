'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import Image from 'next/image'
import { getImageUrl } from '@/lib/utils/image'

interface VendorResource {
  id: string
  name: string
  resource_type: string
  file_url: string | null
  thumbnail_url: string | null
  display_order: number
}

interface VendorResourcesCarouselProps {
  resources: VendorResource[]
}

export function VendorResourcesCarousel({ resources }: VendorResourcesCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedResource, setSelectedResource] = useState<VendorResource | null>(null)

  // Calculate how many items we can show (3 on desktop, 1 on mobile)
  const itemsPerPage = 3
  const totalPages = Math.ceil(resources.length / itemsPerPage)

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % totalPages)
  }

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + totalPages) % totalPages)
  }

  const getCurrentResources = () => {
    const start = currentIndex * itemsPerPage
    return resources.slice(start, start + itemsPerPage)
  }

  return (
    <div className="relative">
      {/* Carousel Container */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {getCurrentResources().map((resource) => (
          <div key={resource.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            {/* Thumbnail */}
            {resource.thumbnail_url && (
              <div className="relative w-full h-48 bg-white rounded-lg mb-4 overflow-hidden">
                <Image
                  src={getImageUrl(resource.thumbnail_url, 'card')}
                  alt={resource.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 33vw"
                  loading="lazy"
                />
              </div>
            )}

            {/* Resource Info */}
            <div className="space-y-3">
              <div>
                <h4 className="font-semibold text-gray-900 mb-1 line-clamp-2">{resource.name}</h4>
                <Badge variant="outline" className="text-xs">
                  {resource.resource_type.toUpperCase()}
                </Badge>
              </div>

              {/* Action Button */}
              {resource.file_url && (
                <button
                  onClick={() => setSelectedResource(resource)}
                  className="w-full text-center px-4 py-2 bg-[#0066cc] text-white rounded-lg hover:bg-[#0052a3] transition-colors text-sm font-medium"
                >
                  {resource.resource_type === 'video' ? 'Watch Video' :
                   resource.resource_type === 'document' || resource.resource_type === 'pdf' ? 'View Document' :
                   resource.resource_type === 'image' ? 'View Image' :
                   'View Resource'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Navigation Buttons - Only show if more than 3 resources */}
      {resources.length > itemsPerPage && (
        <>
          <button
            onClick={prevSlide}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 bg-white rounded-full p-2 shadow-lg hover:bg-gray-50 transition-colors z-10"
            aria-label="Previous resources"
          >
            <ChevronLeft className="w-6 h-6 text-gray-700" />
          </button>

          <button
            onClick={nextSlide}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 bg-white rounded-full p-2 shadow-lg hover:bg-gray-50 transition-colors z-10"
            aria-label="Next resources"
          >
            <ChevronRight className="w-6 h-6 text-gray-700" />
          </button>

          {/* Dots Indicator */}
          <div className="flex justify-center gap-2 mt-6">
            {Array.from({ length: totalPages }).map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index === currentIndex ? 'bg-[#0066cc]' : 'bg-gray-300'
                }`}
                aria-label={`Go to page ${index + 1}`}
              />
            ))}
          </div>
        </>
      )}

      {/* Modal */}
      {selectedResource && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setSelectedResource(null)}
        >
          <div
            className="relative w-full max-w-6xl max-h-[90vh] bg-white rounded-lg shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b bg-gray-50">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{selectedResource.name}</h3>
                <Badge variant="outline" className="text-xs mt-1">
                  {selectedResource.resource_type.toUpperCase()}
                </Badge>
              </div>
              <button
                onClick={() => setSelectedResource(null)}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5 text-gray-700" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-auto max-h-[calc(90vh-80px)]">
              {selectedResource.resource_type === 'video' ? (
                <div className="aspect-video w-full">
                  <iframe
                    src={selectedResource.file_url || ''}
                    className="w-full h-full rounded-lg"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : selectedResource.resource_type === 'image' ? (
                <div className="flex justify-center">
                  <img
                    src={selectedResource.file_url || ''}
                    alt={selectedResource.name}
                    className="max-w-full h-auto rounded-lg"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <iframe
                    src={selectedResource.file_url || ''}
                    className="w-full h-[600px] rounded-lg border"
                  />
                  <a
                    href={selectedResource.file_url || ''}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 px-6 py-3 bg-[#0066cc] text-white rounded-lg hover:bg-[#0052a3] transition-colors"
                  >
                    Open in New Tab
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
