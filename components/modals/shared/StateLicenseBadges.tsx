'use client'

import { Badge } from '@/components/ui/badge'

interface StateLicenseBadgesProps {
  licenses: string[]
}

export function StateLicenseBadges({ licenses }: StateLicenseBadgesProps) {
  if (!licenses || licenses.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-2">
      {licenses.map((license) => (
        <Badge
          key={license}
          variant="secondary"
          className="bg-[#25314e] text-white hover:bg-[#1a233a]"
        >
          {license}
        </Badge>
      ))}
    </div>
  )
}
