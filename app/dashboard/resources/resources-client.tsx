'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { getImageUrl } from '@/lib/utils/image'

interface Resource {
  id: string
  slug: string
  title: string
  resource_type: string
  thumbnail_url: string | null
}

interface Category {
  id: string
  name: string
}

interface ContentType {
  id: string
  name: string
  slug: string
}

interface ResourcesClientProps {
  categories: Category[]
  contentTypes: ContentType[]
}

interface PaginationData {
  page: number
  limit: number
  total: number
  totalPages: number
}

export default function ResourcesClient({ categories, contentTypes }: ResourcesClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Initialize state from URL params
  const pageParam = searchParams.get('page')
  const categoryParam = searchParams.get('category')
  const typeParam = searchParams.get('type')

  const [resources, setResources] = useState<Resource[]>([])
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 0
  })
  const [selectedCategory, setSelectedCategory] = useState(categoryParam || '')
  const [selectedType, setSelectedType] = useState(typeParam || '')
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)

  const fetchResources = async (page: number, category: string = '', type: string = '') => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '12'
      })

      if (category) {
        params.append('category', category)
      }

      if (type) {
        params.append('type', type)
      }

      const response = await fetch(`/api/resources?${params.toString()}`)
      const data = await response.json()

      if (response.ok) {
        setResources(data.resources)
        setPagination(data.pagination)
      } else {
        console.error('Error fetching resources:', data.error)
      }
    } catch (error) {
      console.error('Error fetching resources:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateURL = (page: number, category: string, type: string) => {
    const params = new URLSearchParams()

    if (page > 1) {
      params.set('page', page.toString())
    }

    if (category) {
      params.set('category', category)
    }

    if (type) {
      params.set('type', type)
    }

    const queryString = params.toString()
    const newURL = queryString ? `/dashboard/resources?${queryString}` : '/dashboard/resources'
    router.push(newURL, { scroll: false })
  }

  // Sync with URL params when they change (e.g., browser back/forward, direct navigation)
  useEffect(() => {
    const urlPage = pageParam ? parseInt(pageParam, 10) : 1
    const urlCategory = categoryParam || ''
    const urlType = typeParam || ''

    // Update local state to match URL
    if (urlCategory !== selectedCategory) {
      setSelectedCategory(urlCategory)
    }
    if (urlType !== selectedType) {
      setSelectedType(urlType)
    }

    // Fetch resources with URL params
    fetchResources(urlPage, urlCategory, urlType)
    setInitialized(true)
  }, [pageParam, categoryParam, typeParam])

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      updateURL(newPage, selectedCategory, selectedType)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCategory = e.target.value
    updateURL(1, newCategory, selectedType)
  }

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value
    updateURL(1, selectedCategory, newType)
  }

  return (
    <div className="min-h-screen">
      {/* Page Header */}
      <div className="px-4 md:px-8 py-6 md:py-8">
        <h1 className="text-3xl md:text-4xl font-bold text-[#dd1969] mb-2">
          RESOURCES
        </h1>
        <p className="text-gray-600 text-sm md:text-base">
          Discover, Learn, and Grow with AIME Resources
        </p>

        {/* Filter Bar */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <span className="text-sm font-medium text-gray-700">Filter:</span>
            <select
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#dd1969]"
              value={selectedType}
              onChange={handleTypeChange}
            >
              <option value="">All Types</option>
              {contentTypes?.map(type => (
                <option key={type.id} value={type.slug}>{type.name}</option>
              ))}
            </select>
            <select
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#dd1969]"
              value={selectedCategory}
              onChange={handleCategoryChange}
            >
              <option value="">All Categories</option>
              {categories?.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <p className="text-sm text-gray-600">
            Showing <span className="font-semibold">{resources.length}</span> of <span className="font-semibold">{pagination.total}</span> resources
          </p>
        </div>
      </div>

      {/* Resources Grid */}
      <div className="px-4 md:px-8 pb-8">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-[#dd1969]" />
          </div>
        ) : resources.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-600 text-lg">No resources found</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              {resources.map((resource) => (
                <div
                  key={resource.id}
                  className="bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-shadow"
                >
                  {/* Thumbnail */}
                  <Link href={`/dashboard/resources/${resource.slug}?${searchParams.toString()}`}>
                    <div className="relative w-full aspect-video bg-gray-200 cursor-pointer">
                      {resource.thumbnail_url && (
                        <Image
                          src={getImageUrl(resource.thumbnail_url, 'card')}
                          alt={resource.title}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                          loading="lazy"
                        />
                      )}
                    </div>
                  </Link>

                  {/* Content */}
                  <div className="p-4">
                    {/* Resource Type Badge */}
                    <div className="flex justify-center mb-3">
                      <Badge className="bg-[#1a2547] text-white capitalize px-3 py-1 text-xs font-semibold">
                        {resource.resource_type}
                      </Badge>
                    </div>

                    <h3 className="font-bold text-gray-900 mb-3 line-clamp-2 min-h-[48px] text-base text-center">
                      {resource.title}
                    </h3>
                    <Link href={`/dashboard/resources/${resource.slug}?${searchParams.toString()}`}>
                      <Button className="w-full bg-[#dd1969] hover:bg-[#c01559] text-white font-bold rounded-full text-base py-3">
                        {resource.resource_type === 'podcast' && 'Listen Now'}
                        {resource.resource_type === 'video' && 'Watch Now'}
                        {resource.resource_type === 'webinar' && 'Watch Webinar'}
                        {resource.resource_type === 'document' && 'View Document'}
                        {resource.resource_type === 'blog' && 'Read Blog'}
                        {resource.resource_type === 'infographic' && 'View Infographic'}
                        {(resource.resource_type === 'pdf' || resource.resource_type === 'article') && 'Learn More'}
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="border-gray-300"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>

                <div className="flex items-center gap-2">
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                    .filter(page => {
                      // Show first page, last page, current page, and pages around current
                      return (
                        page === 1 ||
                        page === pagination.totalPages ||
                        Math.abs(page - pagination.page) <= 1
                      )
                    })
                    .map((page, index, array) => {
                      // Add ellipsis
                      const prevPage = array[index - 1]
                      const showEllipsis = prevPage && page - prevPage > 1

                      return (
                        <div key={page} className="flex items-center gap-2">
                          {showEllipsis && (
                            <span className="text-gray-500 px-2">...</span>
                          )}
                          <Button
                            variant={pagination.page === page ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handlePageChange(page)}
                            className={
                              pagination.page === page
                                ? 'bg-[#dd1969] hover:bg-[#c01559] text-white'
                                : 'border-gray-300'
                            }
                          >
                            {page}
                          </Button>
                        </div>
                      )
                    })}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages}
                  className="border-gray-300"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Page Info */}
            <div className="mt-4 text-center text-sm text-gray-600">
              Page {pagination.page} of {pagination.totalPages}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
