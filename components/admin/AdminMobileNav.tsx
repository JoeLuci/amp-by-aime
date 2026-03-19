'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  FileText,
  Building2,
  Bell,
  Settings,
  LayoutGrid,
  Calendar,
} from 'lucide-react'

const navItems = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Users', href: '/admin/users', icon: Users },
  { name: 'Content', href: '/admin/categories', icon: LayoutGrid },
  { name: 'Resources', href: '/admin/resources', icon: FileText },
  { name: 'Lenders', href: '/admin/lenders', icon: Building2 },
  { name: 'Events', href: '/admin/events', icon: Calendar },
  { name: 'Notify', href: '/admin/notifications', icon: Bell },
  { name: 'Settings', href: '/admin/settings', icon: Settings },
]

export function AdminMobileNav() {
  const pathname = usePathname()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#25314e] border-t border-white/10 z-50">
      <div className="grid grid-cols-8 h-16">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || (item.href !== '/admin' && pathname?.startsWith(item.href))

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
