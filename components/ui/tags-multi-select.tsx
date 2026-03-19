'use client'

import { useState, useRef, useEffect } from 'react'
import { X, ChevronDown } from 'lucide-react'
import { Badge } from './badge'
import { Input } from './input'

interface Tag {
  id: string
  name: string
  slug: string
}

interface TagsMultiSelectProps {
  availableTags: Tag[]
  selectedTagIds: string[]
  onChange: (tagIds: string[]) => void
  placeholder?: string
}

export function TagsMultiSelect({
  availableTags,
  selectedTagIds,
  onChange,
  placeholder = 'Select tags...'
}: TagsMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedTags = availableTags.filter(tag => selectedTagIds.includes(tag.id))
  const filteredTags = availableTags.filter(tag =>
    tag.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onChange(selectedTagIds.filter(id => id !== tagId))
    } else {
      onChange([...selectedTagIds, tagId])
    }
  }

  const removeTag = (tagId: string) => {
    onChange(selectedTagIds.filter(id => id !== tagId))
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="min-h-[42px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 cursor-pointer hover:border-gray-400 focus-within:border-[#dd1969] focus-within:ring-2 focus-within:ring-[#dd1969]/20"
      >
        <div className="flex flex-wrap gap-2">
          {selectedTags.length > 0 ? (
            selectedTags.map(tag => (
              <Badge
                key={tag.id}
                variant="secondary"
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 gap-1"
              >
                {tag.name}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeTag(tag.id)
                  }}
                  className="ml-1 hover:text-red-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))
          ) : (
            <span className="text-gray-500 text-sm">{placeholder}</span>
          )}
          <ChevronDown className={`ml-auto w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-hidden">
          <div className="p-2 border-b">
            <Input
              type="text"
              placeholder="Search tags..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="h-8"
            />
          </div>
          <div className="overflow-y-auto max-h-48">
            {filteredTags.length > 0 ? (
              filteredTags.map(tag => (
                <div
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  className={`px-3 py-2 cursor-pointer hover:bg-gray-100 flex items-center gap-2 ${
                    selectedTagIds.includes(tag.id) ? 'bg-blue-50' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedTagIds.includes(tag.id)}
                    onChange={() => {}}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">{tag.name}</span>
                </div>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-gray-500 text-center">
                No tags found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
