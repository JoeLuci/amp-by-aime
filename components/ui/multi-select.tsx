'use client'

import { useState, useRef, useEffect } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MultiSelectOption {
  label: string
  value: string
}

interface MultiSelectProps {
  options: MultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  label?: string
  disabled?: boolean
  className?: string
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Select options...',
  label,
  disabled = false,
  className,
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const allSelected = value.length === options.length
  const noneSelected = value.length === 0

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleSelectAll = () => {
    if (allSelected) {
      onChange([])
    } else {
      onChange(options.map(opt => opt.value))
    }
  }

  const toggleOption = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter(v => v !== optionValue))
    } else {
      onChange([...value, optionValue])
    }
  }

  const removeValue = (optionValue: string) => {
    onChange(value.filter(v => v !== optionValue))
  }

  const getSelectedLabels = () => {
    return options
      .filter(opt => value.includes(opt.value))
      .map(opt => opt.label)
  }

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}

      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          'w-full min-h-[42px] px-3 py-2 border border-gray-300 rounded-lg',
          'flex items-center gap-2 flex-wrap cursor-pointer',
          'focus-within:outline-none focus-within:ring-2 focus-within:ring-[#8b1554]',
          disabled && 'bg-gray-100 cursor-not-allowed opacity-60'
        )}
      >
        {noneSelected ? (
          <span className="text-gray-400 text-sm">{placeholder}</span>
        ) : allSelected ? (
          <span className="text-sm font-medium text-gray-900">All Selected</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {getSelectedLabels().map((label, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1 px-2 py-1 bg-[#8b1554] text-white text-xs rounded-md"
              >
                {label}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    const option = options.find(opt => opt.label === label)
                    if (option) removeValue(option.value)
                  }}
                  className="hover:bg-[#6d0f42] rounded-sm"
                  disabled={disabled}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <ChevronDown className={cn(
          'w-4 h-4 text-gray-400 ml-auto transition-transform',
          isOpen && 'transform rotate-180'
        )} />
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
          {/* Select All option */}
          <div
            onClick={toggleSelectAll}
            className={cn(
              'px-3 py-2 cursor-pointer hover:bg-gray-50 flex items-center gap-2',
              'border-b border-gray-200 font-medium'
            )}
          >
            <div className={cn(
              'w-4 h-4 border-2 rounded flex items-center justify-center flex-shrink-0',
              allSelected ? 'bg-[#8b1554] border-[#8b1554]' : 'border-gray-300'
            )}>
              {allSelected && <Check className="w-3 h-3 text-white" />}
            </div>
            <span className="text-sm">
              {allSelected ? 'Deselect All' : 'Select All'}
            </span>
          </div>

          {/* Individual options */}
          {options.map((option) => {
            const isSelected = value.includes(option.value)
            return (
              <div
                key={option.value}
                onClick={() => toggleOption(option.value)}
                className="px-3 py-2 cursor-pointer hover:bg-gray-50 flex items-center gap-2"
              >
                <div className={cn(
                  'w-4 h-4 border-2 rounded flex items-center justify-center flex-shrink-0',
                  isSelected ? 'bg-[#8b1554] border-[#8b1554]' : 'border-gray-300'
                )}>
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className="text-sm">{option.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
