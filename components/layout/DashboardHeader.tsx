'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import GlobalSearch from './GlobalSearch'
import NotificationsDropdown from './NotificationsDropdown'
import { Button } from '@/components/ui/button'

interface DashboardHeaderProps {
  user?: {
    full_name?: string
    email: string
  }
  isAdmin?: boolean
}

export default function DashboardHeader({ user, isAdmin }: DashboardHeaderProps) {
  const router = useRouter()
  const fullName = user?.full_name || user?.email || 'User'
  const firstName = fullName.split(' ')[0]

  return (
    <>
      {/* Desktop Header */}
      <header className="hidden md:block bg-white border-b border-gray-200 px-8 py-4">
        <div className="flex items-center justify-between">
          {/* Search */}
          <GlobalSearch />

          {/* User Actions */}
          <div className="flex items-center gap-6">
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/admin')}
                className="flex items-center gap-2 border-[#8b1554] text-[#8b1554] hover:bg-[#8b1554] hover:text-white"
              >
                <ShieldCheck className="w-4 h-4" />
                Back to Admin
              </Button>
            )}
            <NotificationsDropdown />
            <form action="/auth/sign-out" method="post">
              <button className="text-sm font-semibold text-[#dd1969] hover:underline">
                Log Out
              </button>
            </form>
            <p className="text-sm">
              Hi, <span className="font-bold text-[#25314e]">{firstName}</span>
            </p>
          </div>
        </div>
      </header>

      {/* Mobile Search */}
      <div className="md:hidden px-4 py-3 bg-white border-b border-gray-200">
        <GlobalSearch />
      </div>
    </>
  )
}
