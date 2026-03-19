import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'

interface SortableTableHeaderProps<T> {
  label: string
  sortKey: keyof T
  currentSortKey: keyof T | null
  currentSortDirection: 'asc' | 'desc' | null
  onSort: (key: keyof T) => void
  className?: string
}

export function SortableTableHeader<T>({
  label,
  sortKey,
  currentSortKey,
  currentSortDirection,
  onSort,
  className = ''
}: SortableTableHeaderProps<T>) {
  const isActive = currentSortKey === sortKey
  const direction = isActive ? currentSortDirection : null

  return (
    <th
      className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors ${className}`}
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-2 select-none">
        <span>{label}</span>
        <span className="text-gray-400">
          {direction === 'asc' && <ArrowUp className="w-4 h-4" />}
          {direction === 'desc' && <ArrowDown className="w-4 h-4" />}
          {direction === null && <ArrowUpDown className="w-4 h-4 opacity-50" />}
        </span>
      </div>
    </th>
  )
}
