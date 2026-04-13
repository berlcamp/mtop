"use client"

import { Sidebar } from "@/components/layout/sidebar"
import { Topbar } from "@/components/layout/topbar"
import { ProfileProvider } from "@/lib/hooks/use-profile"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProfileProvider>
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Main area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Topbar */}
          <Topbar />

          {/* Page content */}
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </ProfileProvider>
  )
}
