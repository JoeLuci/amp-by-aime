'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import {
  LayoutDashboard,
  Users,
  Tag,
  Star,
  FileText,
  Building2,
  Store,
  Calendar,
  UserCheck,
  Settings,
  ChevronLeft,
  ChevronRight,
  Ticket,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Shield,
  Bell,
  CreditCard,
  Package,
  BarChart3,
  TrendingUp,
  Activity,
  Video
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface AdminSidebarProps {
  profile: {
    full_name?: string
    avatar_url?: string
  } | null
}

interface NavigationItem {
  name: string
  href?: string
  icon: any
  children?: NavigationItem[]
}

const navigation: NavigationItem[] = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Analytics', href: '/admin/analytics', icon: TrendingUp },
  {
    name: 'Manage Users',
    icon: Users,
    children: [
      { name: 'All Users', href: '/admin/users', icon: Users },
      { name: 'Admins', href: '/admin/admins', icon: Shield },
      { name: 'Vendor/Lender', href: '/admin/vendor-lender', icon: UserCheck },
      { name: 'Engagement', href: '/admin/engagement', icon: Activity },
    ]
  },
  {
    name: 'Subscriptions',
    icon: CreditCard,
    children: [
      { name: 'Overview', href: '/admin/subscriptions', icon: BarChart3 },
      { name: 'Plans', href: '/admin/subscriptions/plans', icon: Package },
      { name: 'Coupons', href: '/admin/subscriptions/coupons', icon: Ticket },
    ]
  },
  {
    name: 'Content',
    icon: LayoutGrid,
    children: [
      { name: 'Types', href: '/admin/types', icon: LayoutGrid },
      { name: 'Categories', href: '/admin/categories', icon: LayoutGrid },
      { name: 'Tags', href: '/admin/tags', icon: Tag },
      { name: 'Featured', href: '/admin/featured', icon: Star },
    ]
  },
  {
    name: 'Platform',
    icon: FileText,
    children: [
      { name: 'Resources', href: '/admin/resources', icon: FileText },
      { name: 'Lenders', href: '/admin/lenders', icon: Building2 },
      { name: 'Vendors', href: '/admin/vendors', icon: Store },
      { name: 'Events', href: '/admin/events', icon: Calendar },
      { name: 'Fuse Registration', href: '/admin/fuse-registration', icon: Ticket },
      { name: 'Notifications', href: '/admin/notifications', icon: Bell },
    ]
  },
  { name: 'Training Videos', href: '/admin/training', icon: Video },
]

export function AdminSidebar({ profile }: AdminSidebarProps) {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    'Manage Users': true,
    'Content': false,
    'Platform': false,
    'Subscriptions': false,
  })

  const toggleSection = (name: string) => {
    setOpenSections(prev => ({ ...prev, [name]: !prev[name] }))
  }

  const renderNavItem = (item: NavigationItem) => {
    const hasChildren = item.children && item.children.length > 0
    const isOpen = openSections[item.name]
    const Icon = item.icon

    // Check if any child is active
    const isChildActive = hasChildren && item.children?.some(child =>
      pathname === child.href || pathname?.startsWith(child.href + '/')
    )

    if (hasChildren) {
      return (
        <div key={item.name}>
          <button
            onClick={() => toggleSection(item.name)}
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors w-full',
              isChildActive
                ? 'bg-white/10 text-white font-semibold'
                : 'text-white hover:bg-white/10',
              isCollapsed && 'justify-center'
            )}
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && (
              <>
                <span className="text-sm flex-1 text-left">{item.name}</span>
                {isOpen ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </>
            )}
          </button>

          {!isCollapsed && isOpen && (
            <div className="ml-4 mt-1 space-y-1">
              {item.children?.map((child) => {
                // Exact match only - don't highlight parent paths
                const isActive = pathname === child.href
                const ChildIcon = child.icon

                return (
                  <Link
                    key={child.name}
                    href={child.href!}
                    className={cn(
                      'flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm',
                      isActive
                        ? 'bg-white text-[#1a2547] font-semibold'
                        : 'text-white/80 hover:bg-white/10 hover:text-white'
                    )}
                  >
                    <ChildIcon className="w-4 h-4 flex-shrink-0" />
                    <span>{child.name}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    // Single item without children
    // Dashboard should only be active on exact match to avoid matching all /admin/* routes
    const isActive = item.href === '/admin'
      ? pathname === '/admin'
      : pathname === item.href || pathname?.startsWith(item.href + '/')
    return (
      <Link
        key={item.name}
        href={item.href!}
        className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
          isActive
            ? 'bg-white text-[#1a2547] font-semibold'
            : 'text-white hover:bg-white/10',
          isCollapsed && 'justify-center'
        )}
        title={isCollapsed ? item.name : undefined}
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        {!isCollapsed && <span className="text-sm">{item.name}</span>}
      </Link>
    )
  }

  return (
    <div
      className={cn(
        'hidden md:flex fixed left-0 top-0 h-screen flex-col transition-all duration-300 overflow-hidden',
        isCollapsed ? 'w-20' : 'w-64'
      )}
    >
      {/* Background Image */}
      <div className="absolute inset-0 h-full w-full">
        <Image
          src="/assets/AMP-SidebarBG.jpg"
          alt=""
          fill
          sizes="(max-width: 768px) 0vw, 256px"
          quality={75}
          className="object-cover h-full w-full"
          priority
        />
      </div>

      {/* Dotted Pattern Overlay */}
      <div className="absolute inset-0 h-full w-full dotted-pattern opacity-30" />

      {/* Sidebar content with relative positioning */}
      <div className="relative z-10 flex-1 flex flex-col text-white overflow-y-auto">
        {/* Logo and profile section */}
        <div className="p-6 text-center border-b border-white/10">
          <div className="mb-4">
            {!isCollapsed ? (
              <Image
                src="/assets/AMP_MemberPortalLogo_White.svg"
                alt="AIME Member Portal"
                width={180}
                height={60}
                className="mx-auto"
              />
            ) : (
              <Image
                src="/assets/AMP_LogoAWhite.svg"
                alt="AMP"
                width={40}
                height={40}
                className="mx-auto"
              />
            )}
          </div>

          {!isCollapsed && (
            <>
              <div className="mb-4">
                <div className="bg-gradient-to-r from-white/20 to-white/10 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/30 shadow-lg">
                  <p className="text-lg font-bold text-white tracking-wider text-center">
                    ADMIN PORTAL
                  </p>
                </div>
              </div>
              <div className="flex justify-center">
                <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center overflow-hidden ring-2 ring-white/30">
                  {profile?.avatar_url ? (
                    <Image
                      src={profile.avatar_url}
                      alt={profile.full_name || 'Admin'}
                      width={96}
                      height={96}
                      className="object-cover"
                    />
                  ) : (
                    <Users className="w-12 h-12 text-white/60" />
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2">
          {navigation.map((item) => renderNavItem(item))}

          {/* Settings */}
          <Link
            href="/admin/settings"
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
              pathname === '/admin/settings'
                ? 'bg-white text-[#1a2547] font-semibold'
                : 'text-white hover:bg-white/10',
              isCollapsed && 'justify-center'
            )}
            title={isCollapsed ? 'Settings' : undefined}
          >
            <Settings className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span className="text-sm">Settings</span>}
          </Link>
        </nav>

        {/* Collapse button */}
        <div className="p-4 border-t border-white/10">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg text-white hover:bg-white/10 transition-colors"
          >
            {isCollapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <>
                <ChevronLeft className="w-5 h-5" />
                <span className="text-sm">Collapse</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
