'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StateLicenseBadges } from './StateLicenseBadges'

interface UserInfoSectionProps {
  fullName: string
  email: string
  phone?: string
  nmlsNumber?: string
  stateLicenses?: string[]
}

export function UserInfoSection({
  fullName,
  email,
  phone,
  nmlsNumber,
  stateLicenses
}: UserInfoSectionProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="user-name">Name</Label>
        <Input
          id="user-name"
          value={fullName}
          readOnly
          disabled
          className="bg-gray-50"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="user-email">Email</Label>
          <Input
            id="user-email"
            type="email"
            value={email}
            readOnly
            disabled
            className="bg-gray-50"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="user-phone">Phone number</Label>
          <Input
            id="user-phone"
            type="tel"
            value={phone || ''}
            readOnly
            disabled
            className="bg-gray-50"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="user-nmls">NMLS #</Label>
          <Input
            id="user-nmls"
            value={nmlsNumber || ''}
            readOnly
            disabled
            className="bg-gray-50"
          />
        </div>

        <div className="space-y-2">
          <Label>State Licenses</Label>
          <div className="min-h-[40px] flex items-center">
            {stateLicenses && stateLicenses.length > 0 ? (
              <StateLicenseBadges licenses={stateLicenses} />
            ) : (
              <span className="text-sm text-gray-400">No licenses added</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
