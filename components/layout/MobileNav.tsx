'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Brain,
  BookOpen,
  Handshake,
  Store,
  Calendar,
  Headphones,
  Settings as SettingsIcon
} from 'lucide-react'

interface MobileNavProps {
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
  { name: 'Settings', href: '/dashboard/settings', icon: SettingsIcon },
]

// Navigation items visible to partner vendors and lenders
const PARTNER_NAV_ITEMS = ['Resources', 'Lenders', 'Market']

export default function MobileNav({ userRole }: MobileNavProps) {
  const pathname = usePathname()

  // Check if user is a partner (vendor or lender)
  const isPartner = userRole === 'partner_vendor' || userRole === 'partner_lender'

  // Filter nav items for partners
  const filteredNavItems = isPartner
    ? navItems.filter(item => PARTNER_NAV_ITEMS.includes(item.name))
    : navItems

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#25314e] border-t border-white/10 z-50">
      <div className={`grid ${isPartner ? 'grid-cols-3' : 'grid-cols-8'} h-16`}>
        {filteredNavItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 transition-colors ${
                isActive
                  ? 'text-white'
                  : 'text-white/60 hover:text-white/80'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.name}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
