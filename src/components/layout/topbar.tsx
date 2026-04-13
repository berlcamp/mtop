"use client"

import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/lib/hooks/use-auth"
import { useProfile } from "@/lib/hooks/use-profile"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Bell, ChevronDown, LogOut, User } from "lucide-react"

// Map route segments to readable labels
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  applications: "Applications",
  "negative-list": "Negative List",
  reports: "Reports",
  admin: "Admin",
  users: "Users",
  settings: "Settings",
  account: "Account",
}

function useBreadcrumbs() {
  const pathname = usePathname()
  // e.g. "/dashboard/applications/abc" → ["dashboard", "applications", "abc"]
  const segments = pathname.split("/").filter(Boolean)

  const crumbs: { label: string; href: string }[] = []
  let path = ""

  for (const segment of segments) {
    path += `/${segment}`
    const label = SEGMENT_LABELS[segment]
    // Skip UUID-like segments (application detail pages etc.)
    if (!label) continue
    crumbs.push({ label, href: path })
  }

  return crumbs
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function Breadcrumbs() {
  const crumbs = useBreadcrumbs()

  if (crumbs.length === 0) return null

  return (
    <nav className="flex items-center gap-1.5 text-sm">
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1.5">
          {i > 0 && (
            <span className="text-muted-foreground/50 select-none">›</span>
          )}
          <span
            className={
              i === crumbs.length - 1
                ? "font-semibold text-foreground"
                : "text-muted-foreground"
            }
          >
            {crumb.label}
          </span>
        </span>
      ))}
    </nav>
  )
}

export function Topbar() {
  const router = useRouter()
  const { user, signOut } = useAuth()
  const { profile } = useProfile()

  const displayName = profile?.full_name || user?.email || "User"
  const displayEmail = profile?.email || user?.email || ""
  const officeName = profile?.office?.name || ""
  const initials = getInitials(displayName)
  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url

  // Truncate long names
  const shortName =
    displayName.length > 20 ? displayName.slice(0, 18) + "…" : displayName

  return (
    <header className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b bg-background px-4 md:px-6">
      {/* Breadcrumbs */}
      <div className="hidden md:block pl-0">
        <Breadcrumbs />
      </div>
      {/* Spacer on mobile (hamburger is absolute positioned) */}
      <div className="md:hidden" />

      {/* Right side controls */}
      <div className="flex items-center gap-1">
        {/* Notification bell */}
        <button
          type="button"
          className="relative rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>

        {/* Divider */}
        <div className="mx-1 h-5 w-px bg-border" />

        {/* User dropdown */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger
            type="button"
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground outline-none transition-colors"
          >
            <Avatar className="h-7 w-7">
              <AvatarImage src={avatarUrl} alt={displayName} />
              <AvatarFallback className="text-[11px] bg-primary text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="hidden text-sm font-medium md:block">
              {shortName}
            </span>
            <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground md:block" />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            className="min-w-[220px] w-auto"
          >
            {/* User info block — GroupLabel requires Menu.Group (DropdownMenuGroup) */}
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                <div className="flex items-center gap-2.5 py-0.5">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={avatarUrl} alt={displayName} />
                    <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {displayName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {displayEmail}
                    </p>
                    {officeName && (
                      <p className="truncate text-xs text-muted-foreground">
                        {officeName}
                      </p>
                    )}
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={() => {
                router.push("/dashboard/account")
              }}
            >
              <User className="h-4 w-4" />
              Profile
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                void signOut()
              }}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
