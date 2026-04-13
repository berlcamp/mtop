"use client"

import { useAuth } from "@/lib/hooks/use-auth"
import { useProfile } from "@/lib/hooks/use-profile"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LogOut, User } from "lucide-react"

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export function Topbar() {
  const { user, signOut } = useAuth()
  const { profile } = useProfile()

  const displayName = profile?.full_name || user?.email || "User"
  const displayEmail = profile?.email || user?.email || ""
  const officeName = profile?.office?.name || ""

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4 md:px-6">
      {/* Left side - breadcrumbs placeholder */}
      <div className="md:pl-0 pl-10" />

      {/* Right side - user dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground outline-none">
          <Avatar className="h-8 w-8">
            <AvatarImage
              src={profile?.avatar_url || user?.user_metadata?.avatar_url}
              alt={displayName}
            />
            <AvatarFallback className="text-xs">
              {getInitials(displayName)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-sm font-medium md:inline-block">
            {displayName}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium">{displayName}</p>
              <p className="text-xs text-muted-foreground">{displayEmail}</p>
              {officeName && (
                <p className="text-xs text-muted-foreground">{officeName}</p>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <User className="mr-2 h-4 w-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
