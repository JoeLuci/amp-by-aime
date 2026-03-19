'use client'

import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'

interface SearchResult {
  id: string
  title: string
  category: string
  categoryColor: string
  categoryName: string
  url: string
}

export default function GlobalSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [totalResults, setTotalResults] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setIsOpen(false)
      return
    }

    const fetchResults = async () => {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        const allResults = data.results || []
        setTotalResults(allResults.length)
        setResults(allResults.slice(0, 5)) // Show max 5 results in dropdown
        setIsOpen(true)
      } catch (error) {
        console.error('Search error:', error)
        setResults([])
        setTotalResults(0)
      } finally {
        setIsLoading(false)
      }
    }

    // Debounce the search
    const timeoutId = setTimeout(fetchResults, 300)
    return () => clearTimeout(timeoutId)
  }, [query])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && query.trim()) {
      // Navigate to search results page
      router.push(`/dashboard/search?q=${encodeURIComponent(query)}`)
      setIsOpen(false)
    }
  }

  const handleResultClick = () => {
    setIsOpen(false)
    setQuery('')
  }

  const handleViewAll = () => {
    router.push(`/dashboard/search?q=${encodeURIComponent(query)}`)
    setIsOpen(false)
  }

  // Group results by category
  const groupedResults = results.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = []
    }
    acc[item.category].push(item)
    return acc
  }, {} as Record<string, SearchResult[]>)

  return (
    <div ref={searchRef} className="relative flex-1 max-w-2xl">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 z-10" />
      <Input
        type="text"
        placeholder="Search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        className="pl-10 h-12 bg-[#25314e] text-white placeholder:text-gray-300 border-0 rounded-full"
      />

      {/* Dropdown Results */}
      {isOpen && (
        <div className="absolute top-full mt-2 w-full bg-white rounded-lg shadow-lg border border-gray-200 max-h-96 overflow-y-auto z-50">
          {isLoading ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-gray-500">Searching...</p>
            </div>
          ) : results.length > 0 ? (
            <>
              {Object.entries(groupedResults).map(([category, items]) => (
                <div key={category} className="py-2">
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                    {category}
                  </div>
                  {items.map((item) => (
                    <Link
                      key={item.id}
                      href={item.url}
                      onClick={handleResultClick}
                      className="block px-4 py-2 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium text-gray-900">{item.title}</div>
                        <Badge
                          style={{ backgroundColor: item.categoryColor }}
                          className="text-white text-xs flex-shrink-0"
                        >
                          {item.categoryName}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              ))}
              {totalResults > 5 && (
                <div className="border-t border-gray-200 px-4 py-3">
                  <button
                    onClick={handleViewAll}
                    className="text-sm text-[#dd1969] hover:text-[#c01559] font-medium w-full text-left"
                  >
                    View all {totalResults} results →
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="px-4 py-8">
              <p className="text-sm text-gray-500 text-center">No results found for "{query}"</p>
              <p className="text-xs text-gray-400 text-center mt-1">Try searching with different keywords</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
