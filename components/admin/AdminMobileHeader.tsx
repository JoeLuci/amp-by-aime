'use client'

import Image from 'next/image'
import { Eye } from 'lucide-react'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ViewAsModal } from './ViewAsModal'
import AdminGlobalSearch from './AdminGlobalSearch'

export function AdminMobileHeader() {
  const router = useRouter()
  const [showViewAsModal, setShowViewAsModal] = useState(false)

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/admin/login')
    router.refresh()
  }

  return (
    <>
      <header className="md:hidden fixed top-0 left-0 right-0 bg-gradient-to-r from-[#dd1969] to-[#25314e] z-40">
        {/* Dotted Pattern Overlay */}
        <div className="absolute inset-0 dotted-pattern opacity-30" />

        <div className="relative z-10 flex items-center justify-between px-4 py-3">
          {/* Logo and Badge */}
          <div className="flex items-center gap-2">
            <Image
              src="/assets/AMP_MemberPortalLogo_White.svg"
              alt="AMP"
              width={100}
              height={30}
              className="h-8 w-auto"
            />
            <div className="bg-white/20 backdrop-blur-sm rounded px-2 py-0.5 border border-white/30">
              <span className="text-[10px] font-bold text-white tracking-wide">ADMIN</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowViewAsModal(true)}
              className="text-white"
              title="View as User"
            >
              <Eye className="w-5 h-5" />
            </button>
            <button
              onClick={handleLogout}
              className="text-white text-sm font-medium"
            >
              Log Out
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Search */}
      <div className="md:hidden fixed top-[52px] left-0 right-0 px-4 py-3 bg-white border-b border-gray-200 z-30">
        <AdminGlobalSearch />
      </div>

      <ViewAsModal open={showViewAsModal} onOpenChange={setShowViewAsModal} />
    </>
  )
}
