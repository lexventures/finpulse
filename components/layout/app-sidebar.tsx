'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ShoppingCart,
  Building2,
  Globe,
  Store,
  Wallet,
  Package,
  Users,
  Calculator,
  Settings,
  Lock,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  locked?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'CEO Overview', icon: LayoutDashboard },
  { href: '/dtc', label: 'DTC', icon: ShoppingCart },
  { href: '/wholesale', label: 'Wholesale', icon: Building2 },
  { href: '/marketplaces', label: 'Marketplaces', icon: Globe },
  { href: '/retail', label: 'Retail', icon: Store },
  { href: '/cash', label: 'Cash Flow', icon: Wallet },
  { href: '/inventory', label: 'Inventory', icon: Package },
  { href: '/team', label: 'Team', icon: Users, locked: true },
  { href: '/scenarios', label: 'Scenarios', icon: Calculator, locked: true },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-5">
        <div className="flex flex-col gap-0.5">
          <span className="text-lg font-bold tracking-tight">FinPulse</span>
          <span className="text-xs text-muted-foreground">
            ELS Financial Intelligence
          </span>
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const isActive =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname.startsWith(item.href)

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      render={<Link href={item.href} />}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {item.locked && (
                      <SidebarMenuBadge>
                        <Lock className="size-3 text-muted-foreground" />
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
