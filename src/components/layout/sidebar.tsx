"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { usePermissions } from "@/lib/hooks/use-permissions"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import {
  Bike,
  LayoutDashboard,
  FileText,
  AlertTriangle,
  BarChart3,
  Users,
  Settings,
  Menu,
} from "lucide-react"

interface NavItem {
  title: string
  href: string
  icon: React.ElementType
  permissions?: string[]
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
  onClick,
}: {
  item: NavItem
  onClick?: () => void
}) {
  const pathname = usePathname()

  const isActive =
    item.href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(item.href)

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-white/10 text-white"
          : "text-white/60 hover:bg-white/[0.06] hover:text-white/90"
      )}
    >
      <item.icon
        className={cn(
          "h-4 w-4 shrink-0",
          isActive ? "text-white" : "text-white/50"
        )}
      />
      <span>{item.title}</span>
    </Link>
  )
}

function SidebarBody({ onNavClick }: { onNavClick?: () => void }) {
  const { canAny } = usePermissions()

  const filteredNavItems = navItems.filter(
    (item) => !item.permissions || canAny(...item.permissions)
  )
  const filteredAdminItems = adminItems.filter(
    (item) => !item.permissions || canAny(...item.permissions)
  )

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3">
      <div className="space-y-0.5">
        {filteredNavItems.map((item) => (
          <NavLink key={item.href} item={item} onClick={onNavClick} />
        ))}
      </div>

      {filteredAdminItems.length > 0 && (
        <div className="mt-6">
          <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-white/30">
            Admin
          </p>
          <div className="space-y-0.5">
            {filteredAdminItems.map((item) => (
              <NavLink key={item.href} item={item} onClick={onNavClick} />
            ))}
          </div>
        </div>
      )}
    </nav>
  )
}

function SidebarLogo() {
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary">
        <Bike className="h-4 w-4 text-primary-foreground" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold leading-tight text-white">
          MTOP
        </p>
        <p className="truncate text-[11px] leading-tight text-white/50">
          Tricycle Operator Permit
        </p>
      </div>
    </div>
  )
}

export function Sidebar() {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col bg-[#1e1f21] md:flex">
        <SidebarLogo />
        <SidebarBody />
      </aside>

      {/* Mobile sidebar */}
      <Sheet>
        <SheetTrigger
          render={
            <button className="absolute left-3 top-3 z-40 inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground md:hidden" />
          }
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </SheetTrigger>
        <SheetContent side="left" className="w-60 bg-[#1e1f21] p-0 border-r-0">
          <SidebarLogo />
          <SidebarBody />
        </SheetContent>
      </Sheet>
    </>
  )
}
