"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { usePermissions } from "@/lib/hooks/use-permissions"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import {
  Bike,
  LayoutDashboard,
  FileText,
  AlertTriangle,
  BarChart3,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Menu,
} from "lucide-react"

interface NavItem {
  title: string
  href: string
  icon: React.ElementType
  permissions?: string[]
  children?: NavItem[]
}

const navItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Applications",
    href: "/dashboard/applications",
    icon: FileText,
  },
  {
    title: "Negative List",
    href: "/dashboard/negative-list",
    icon: AlertTriangle,
    permissions: ["negative_list.manage"],
  },
  {
    title: "Reports",
    href: "/dashboard/reports",
    icon: BarChart3,
    permissions: ["reports.view"],
  },
]

const adminItems: NavItem[] = [
  {
    title: "Users",
    href: "/dashboard/admin/users",
    icon: Users,
    permissions: ["admin.manage"],
  },
  {
    title: "Settings",
    href: "/dashboard/admin/settings",
    icon: Settings,
    permissions: ["admin.manage"],
  },
]

function NavLink({
  item,
  collapsed,
  onClick,
}: {
  item: NavItem
  collapsed: boolean
  onClick?: () => void
}) {
  const pathname = usePathname()

  // Match exact for dashboard, startsWith for others
  const isActive =
    item.href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(item.href)

  const link = (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span>{item.title}</span>}
    </Link>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              href={item.href}
              onClick={onClick}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            />
          }
        >
          <item.icon className="h-4 w-4 shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="right">{item.title}</TooltipContent>
      </Tooltip>
    )
  }

  return link
}

function SidebarContent({
  collapsed,
  onNavClick,
}: {
  collapsed: boolean
  onNavClick?: () => void
}) {
  const { canAny } = usePermissions()

  const filteredNavItems = navItems.filter(
    (item) => !item.permissions || canAny(...item.permissions)
  )

  const filteredAdminItems = adminItems.filter(
    (item) => !item.permissions || canAny(...item.permissions)
  )

  return (
    <div className="flex flex-col gap-1 px-3 py-2">
      {/* Main navigation */}
      <div className="space-y-1">
        {filteredNavItems.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            collapsed={collapsed}
            onClick={onNavClick}
          />
        ))}
      </div>

      {/* Admin section */}
      {filteredAdminItems.length > 0 && (
        <>
          <div className="my-3 border-t" />
          {!collapsed && (
            <p className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Admin
            </p>
          )}
          <div className="space-y-1">
            {filteredAdminItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                collapsed={collapsed}
                onClick={onNavClick}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-200",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center border-b px-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Bike className="h-6 w-6 shrink-0 text-primary" />
            {!collapsed && (
              <span className="text-lg font-bold tracking-tight">MTOP</span>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2">
          <SidebarContent collapsed={collapsed} />
        </nav>

        {/* Collapse toggle */}
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            className="w-full justify-center"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>
      </aside>

      {/* Mobile sidebar (sheet) */}
      <Sheet>
        <SheetTrigger
          render={
            <button className="md:hidden absolute top-3 left-3 z-40 inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground" />
          }
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <div className="flex h-14 items-center border-b px-4">
            <Link href="/dashboard" className="flex items-center gap-2">
              <Bike className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold tracking-tight">MTOP</span>
            </Link>
          </div>
          <nav className="py-2">
            <SidebarContent collapsed={false} />
          </nav>
        </SheetContent>
      </Sheet>
    </>
  )
}
