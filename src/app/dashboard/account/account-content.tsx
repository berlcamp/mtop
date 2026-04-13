"use client"

import { PageHeader } from "@/components/layout/page-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAuth } from "@/lib/hooks/use-auth"
import { useProfile } from "@/lib/hooks/use-profile"
import { Loader2 } from "lucide-react"

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export function AccountContent() {
  const { user } = useAuth()
  const { profile, isLoading } = useProfile()

  const displayName = profile?.full_name || user?.email || "User"
  const displayEmail = profile?.email || user?.email || ""
  const officeName = profile?.office?.name || ""
  const officeCode = profile?.office?.code || ""
  const initials = getInitials(displayName)
  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
        <span className="sr-only">Loading profile</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Account"
        subtitle="Your profile and sign-in details"
      />

      <Card className="max-w-lg">
        <CardHeader className="flex flex-row items-center gap-4 space-y-0">
          <Avatar className="h-16 w-16">
            <AvatarImage src={avatarUrl} alt={displayName} />
            <AvatarFallback className="text-lg bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <CardTitle className="truncate">{displayName}</CardTitle>
            <CardDescription className="truncate">{displayEmail}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {officeName && (
            <div>
              <p className="text-muted-foreground">Office</p>
              <p className="font-medium">
                {officeName}
                {officeCode ? (
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    ({officeCode})
                  </span>
                ) : null}
              </p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground">User ID</p>
            <p className="font-mono text-xs break-all text-foreground/90">
              {user?.id ?? profile?.id ?? "—"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
