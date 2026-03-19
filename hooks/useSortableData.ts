import { useMemo, useState } from 'react'

type SortDirection = 'asc' | 'desc' | null

export function useSortableData<T>(items: T[], config: { key: keyof T; direction: SortDirection } | null = null) {
  const [sortConfig, setSortConfig] = useState(config)

  const sortedItems = useMemo(() => {
    const sortableItems = [...items]
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        const aValue = a[sortConfig.key]
        const bValue = b[sortConfig.key]

        // Handle null/undefined values
        if (aValue == null && bValue == null) return 0
        if (aValue == null) return sortConfig.direction === 'asc' ? 1 : -1
        if (bValue == null) return sortConfig.direction === 'asc' ? -1 : 1

        // Handle different types
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortConfig.direction === 'asc'
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue)
        }

        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue
        }

        if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
          return sortConfig.direction === 'asc'
            ? (aValue === bValue ? 0 : aValue ? 1 : -1)
            : (aValue === bValue ? 0 : aValue ? -1 : 1)
        }

        // Fallback to string comparison
        return sortConfig.direction === 'asc'
          ? String(aValue).localeCompare(String(bValue))
          : String(bValue).localeCompare(String(aValue))
      })
    }
    return sortableItems
  }, [items, sortConfig])

  const requestSort = (key: keyof T) => {
    let direction: SortDirection = 'asc'
    if (
      sortConfig &&
      sortConfig.key === key &&
      sortConfig.direction === 'asc'
    ) {
      direction = 'desc'
    } else if (
      sortConfig &&
      sortConfig.key === key &&
      sortConfig.direction === 'desc'
    ) {
      direction = null
    }
    setSortConfig(direction === null ? null : { key, direction })
  }

  return { items: sortedItems, requestSort, sortConfig }
}
