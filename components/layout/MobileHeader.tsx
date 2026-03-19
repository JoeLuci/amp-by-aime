'use client'

import Image from 'next/image'
import { Bell } from 'lucide-react'

interface MobileHeaderProps {
  onLogout?: () => void
}

export default function MobileHeader({ onLogout }: MobileHeaderProps) {
  return (
    <header className="md:hidden fixed top-0 left-0 right-0 bg-gradient-to-r from-[#dd1969] to-[#25314e] z-40">
      {/* Dotted Pattern Overlay */}
      <div className="absolute inset-0 dotted-pattern opacity-30" />

      <div className="relative z-10 flex items-center justify-between px-4 py-3">
        {/* Logo */}
        <Image
          src="/assets/AMP_MemberPortalLogo_White.svg"
          alt="AMP"
          width={100}
          height={30}
          className="h-8 w-auto"
        />

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button className="text-white">
            <Bell className="w-6 h-6" />
          </button>
          <form action="/auth/sign-out" method="post">
            <button className="text-white text-sm font-medium">
              Log Out
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
