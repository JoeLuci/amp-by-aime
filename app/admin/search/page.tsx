'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'

interface SearchResult {
  id: string
  title: string
  subtitle?: string
  description?: string
  category: string
  categoryColor: string
  categoryName: string
  url: string
  logo?: string
  thumbnail?: string
  status?: string
}

// Helper function to strip HTML tags
function stripHtml(html: string): string {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

export default function AdminSearchPage() {
  const searchParams = useSearchParams()
  const query = searchParams.get('q') || ''
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 12

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }

    const fetchResults = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResults(data.results || [])
        setCurrentPage(1) // Reset to first page on new search
      } catch (error) {
        console.error('Search error:', error)
        setResults([])
      } finally {
        setLoading(false)
      }
    }

    fetchResults()
  }, [query])

  // Pagination
  const totalPages = Math.ceil(results.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedResults = results.slice(startIndex, endIndex)

  // Group paginated results by category
  const groupedResults = paginatedResults.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = []
    }
    acc[item.category].push(item)
    return acc
  }, {} as Record<string, SearchResult[]>)

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen">
      {/* Back Button */}
      <div className="px-4 md:px-8 py-4 bg-white border-b">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Back to admin dashboard</span>
        </Link>
      </div>

      {/* Page Header */}
      <div className="px-4 md:px-8 py-6 md:py-8">
        <h1 className="text-3xl md:text-4xl font-bold text-[#dd1969] mb-2">
          Search Results
        </h1>
        <p className="text-gray-600 text-sm md:text-base">
          {query ? (
            <>
              Showing results for <span className="font-semibold">"{query}"</span>
            </>
          ) : (
            'Enter a search query to find results'
          )}
        </p>
        {results.length > 0 && (
          <p className="text-sm text-gray-500 mt-2">
            Found {results.length} result{results.length !== 1 ? 's' : ''} (showing {startIndex + 1}-{Math.min(endIndex, results.length)})
          </p>
        )}
      </div>

      {/* Search Results */}
      <div className="px-4 md:px-8 pb-8">
        {loading ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <p className="text-gray-500">Searching...</p>
          </div>
        ) : results.length === 0 && query.trim() ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <p className="text-gray-500">No results found for "{query}"</p>
            <p className="text-sm text-gray-400 mt-2">Try searching with different keywords</p>
          </div>
        ) : results.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <p className="text-gray-500">Enter a search query to see results</p>
          </div>
        ) : (
          <>
            <div className="space-y-8">
              {Object.entries(groupedResults).map(([category, items]) => (
                <div key={category}>
                  {/* Category Header */}
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-xl font-bold text-gray-900">{category}</h2>
                    <span className="text-sm text-gray-500">({items.length})</span>
                  </div>

                  {/* Results Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {items.map((item) => (
                      <Link
                        key={item.id}
                        href={item.url}
                        className="bg-white rounded-lg shadow-md hover:shadow-xl transition-all border border-gray-200 overflow-hidden group"
                      >
                        {/* Image/Logo if available */}
                        {(item.logo || item.thumbnail) && (
                          <div className="relative h-32 bg-gray-100">
                            <Image
                              src={item.logo || item.thumbnail || ''}
                              alt={item.title}
                              fill
                              className="object-cover"
                            />
                          </div>
                        )}

                        <div className="p-6">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h3 className="font-semibold text-gray-900 line-clamp-2 group-hover:text-[#dd1969] transition-colors">
                              {item.title}
                            </h3>
                            <Badge
                              style={{ backgroundColor: item.categoryColor }}
                              className="text-white text-xs flex-shrink-0"
                            >
                              {item.categoryName}
                            </Badge>
                          </div>

                          {item.subtitle && (
                            <p className="text-sm font-medium text-gray-600 mb-2">
                              {item.subtitle}
                            </p>
                          )}

                          {item.description && (
                            <p className="text-sm text-gray-600 line-clamp-3 mb-3">
                              {stripHtml(item.description)}
                            </p>
                          )}

                          {item.status && (
                            <div className="mt-3">
                              <Badge
                                className={
                                  item.status === 'Published' || item.status === 'Active'
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-gray-100 text-gray-800'
                                }
                              >
                                {item.status}
                              </Badge>
                            </div>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex justify-center gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>

                <div className="flex gap-2">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                    // Show first page, last page, current page, and pages around current
                    const showPage =
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1)

                    if (!showPage) {
                      // Show ellipsis
                      if (page === currentPage - 2 || page === currentPage + 2) {
                        return <span key={page} className="px-4 py-2 text-gray-500">...</span>
                      }
                      return null
                    }

                    return (
                      <button
                        key={page}
                        onClick={() => handlePageChange(page)}
                        className={`px-4 py-2 rounded-lg border transition-colors ${
                          currentPage === page
                            ? 'bg-[#dd1969] text-white border-[#dd1969]'
                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {page}
                      </button>
                    )
                  })}
                </div>

                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
