'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  Home,
  Brain,
  BookOpen,
  Handshake,
  Store,
  Calendar,
  Headphones,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface SidebarProps {
  user?: {
    full_name?: string
    email: string
    avatar_url?: string
  }
  userRole?: string
}

const navItems = [
  { name: 'Home', href: '/dashboard', icon: Home },
  { name: 'AIME AI', href: '/dashboard/aime-ai', icon: Brain },
  { name: 'Resources', href: '/dashboard/resources', icon: BookOpen },
  { name: 'Lenders', href: '/dashboard/lenders', icon: Handshake },
  { name: 'Market', href: '/dashboard/market', icon: Store },
  { name: 'Events', href: '/dashboard/events', icon: Calendar },
  { name: 'Support', href: '/dashboard/support', icon: Headphones },
]

// Navigation items visible to partner vendors and lenders
const PARTNER_NAV_ITEMS = ['Resources', 'Lenders', 'Market']

export default function Sidebar({ user, userRole }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const pathname = usePathname()

  // Check if user is a partner (vendor or lender)
  const isPartner = userRole === 'partner_vendor' || userRole === 'partner_lender'

  // Filter nav items for partners
  const filteredNavItems = isPartner
    ? navItems.filter(item => PARTNER_NAV_ITEMS.includes(item.name))
    : navItems

  const getInitials = (name?: string) => {
    if (!name) return user?.email?.[0]?.toUpperCase() || 'U'
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <aside
      className={`fixed left-0 top-0 h-screen transition-all duration-300 flex flex-col overflow-hidden ${
        isCollapsed ? 'w-20' : 'w-56'
      }`}
    >
      {/* Background Image */}
      <div className="absolute inset-0 h-full w-full">
        <Image
          src="/assets/AMP-SidebarBG.jpg"
          alt=""
          fill
          className="object-cover h-full w-full"
          priority
        />
      </div>

      {/* Dotted Pattern Overlay */}
      <div className="absolute inset-0 h-full w-full dotted-pattern opacity-30" />

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full py-3">
        {/* Logo & User Section */}
        <div className="py-3 flex flex-col items-center">
          {/* Logo */}
          <div className="mb-3">
            <Image
              src="/assets/AMP_MemberPortalLogo_White.svg"
              alt="AMP"
              width={isCollapsed ? 40 : 120}
              height={isCollapsed ? 40 : 40}
              className="transition-all duration-300"
            />
          </div>

          {/* User Profile - Name removed */}
          <Link href="/dashboard/settings" className="cursor-pointer hover:opacity-80 transition-opacity">
            <Avatar className={`${isCollapsed ? 'w-12 h-12' : 'w-28 h-28'} transition-all duration-300 border-4 border-white`}>
              <AvatarImage src={user?.avatar_url} />
              <AvatarFallback className="bg-orange-500 text-white text-2xl font-bold">
                {getInitials(user?.full_name)}
              </AvatarFallback>
            </Avatar>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-2 flex flex-col items-center py-4">
          {filteredNavItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-2 px-4 py-3 rounded-lg transition-colors w-full max-w-[180px] ${
                  isActive
                    ? 'bg-white text-gray-900'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                <Icon className="w-6 h-6 flex-shrink-0" />
                {!isCollapsed && (
                  <span className="font-medium text-sm">{item.name}</span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Settings & Collapse */}
        <div className="px-3 py-4 space-y-2 flex flex-col items-center">
          {!isPartner && (
            <Link
              href="/dashboard/settings"
              className={`flex flex-col items-center justify-center gap-2 px-4 py-3 rounded-lg text-white hover:bg-white/10 transition-colors w-full max-w-[180px]`}
            >
              <SettingsIcon className="w-6 h-6 flex-shrink-0" />
              {!isCollapsed && <span className="font-medium text-sm">Settings</span>}
            </Link>
          )}

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`flex flex-col items-center justify-center gap-2 px-4 py-3 rounded-lg text-white hover:bg-white/10 transition-colors w-full max-w-[180px]`}
          >
            {isCollapsed ? (
              <ChevronRight className="w-6 h-6 flex-shrink-0" />
            ) : (
              <>
                <ChevronLeft className="w-6 h-6 flex-shrink-0" />
                <span className="font-medium text-sm">Collapse</span>
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  )
}
