"use client"

import { AppSidebar } from "@/components/layout/sidebar"
import { Topbar } from "@/components/layout/topbar"
import { ProfileProvider } from "@/lib/hooks/use-profile"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

/**
 * The dashboard is an app shell: the sidebar and the topbar are fixed furniture
 * and only the content under them scrolls.
 *
 * The pieces were already built for this — SidebarInset carries overflow-hidden
 * and main carries overflow-y-auto — but the shell was sized with min-h-svh,
 * which is a floor, not a ceiling. A page taller than the viewport simply grew
 * the whole column, so nothing ever reached its own overflow and the window
 * scrolled instead, taking the navigation and the breadcrumbs with it. On an
 * application record, which runs to several screens, the clerk lost the search
 * box and the stage they were working in.
 *
 * Pinning the shell to h-svh and clipping it there makes main the only scroller.
 * min-h-0 is what lets it be one: a flex item defaults to min-height:auto and
 * refuses to shrink below its content, so without it the column would grow
 * exactly as before.
 *
 * The primitives in components/ui are left alone, per CLAUDE.md — this is the
 * one place that decides how tall the shell is.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProfileProvider>
      <SidebarProvider className="h-svh overflow-hidden">
        <AppSidebar />
        <SidebarInset className="min-h-0">
          <Topbar />
          <main className="min-h-0 flex-1 overflow-y-auto p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </ProfileProvider>
  )
}
