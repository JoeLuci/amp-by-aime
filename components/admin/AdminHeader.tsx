'use client'

import { useState } from 'react'
import { Eye } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ViewAsModal } from './ViewAsModal'
import AdminGlobalSearch from './AdminGlobalSearch'

interface AdminHeaderProps {
  profile: {
    full_name?: string
    avatar_url?: string
  } | null
}

export function AdminHeader({ profile }: AdminHeaderProps) {
  const router = useRouter()
  const [showViewAsModal, setShowViewAsModal] = useState(false)

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/admin/login')
    router.refresh()
  }

  const fullName = profile?.full_name || 'Admin User'
  const firstName = fullName.split(' ')[0]

  return (
    <>
      <header className="bg-white border-b border-gray-200 px-8 py-4">
        <div className="flex items-center justify-between">
          {/* Search Bar */}
          <AdminGlobalSearch />

          {/* User Actions - matching user dashboard style, no notifications */}
          <div className="flex items-center gap-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowViewAsModal(true)}
              className="flex items-center gap-2"
            >
              <Eye className="w-4 h-4" />
              View as User
            </Button>
          <button
            onClick={handleLogout}
            className="text-sm font-semibold text-[#dd1969] hover:underline"
          >
            Log Out
          </button>
          <p className="text-sm">
            Hi, <span className="font-bold text-[#25314e]">{firstName}</span>
          </p>
        </div>
      </div>
    </header>

    <ViewAsModal open={showViewAsModal} onOpenChange={setShowViewAsModal} />
    </>
  )
}
