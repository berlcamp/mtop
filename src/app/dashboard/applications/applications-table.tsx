"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { StatusBadge } from "@/components/shared/status-badge"
import { ExpirationBadge } from "@/components/shared/expiration-badge"
import { Search, ChevronLeft, ChevronRight, FileText } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { createClient } from "@/lib/supabase/client"
import { getPermitExpirationInfo } from "@/lib/utils/permit-expiration"
import type { MtopStatus, MtopApplication } from "@/types/database"

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "for_verification", label: "Verification" },
  { value: "for_inspection", label: "Inspection" },
  { value: "for_assessment", label: "Assessment" },
  { value: "for_approval", label: "Approval" },
  { value: "granted", label: "Granted" },
  { value: "rejected", label: "Rejected" },
  { value: "returned", label: "Returned" },
]

const PAGE_SIZE = 20

export function ApplicationsTable({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ status?: string; search?: string; page?: string }>
}) {
  const router = useRouter()
  const urlSearchParams = useSearchParams()

  const status = urlSearchParams.get("status") || "all"
  const search = urlSearchParams.get("search") || ""
  const page = parseInt(urlSearchParams.get("page") || "1", 10)

  const [applications, setApplications] = useState<MtopApplication[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState(search)
  const [settings, setSettings] = useState<{
    permit_validity_years: number
    renewal_window_days: number
  }>({ permit_validity_years: 3, renewal_window_days: 90 })

  const expiration = urlSearchParams.get("expiration") || ""

  const supabase = createClient()

  // Fetch system settings on mount
  useEffect(() => {
    supabase
      .schema("mtop")
      .from("system_settings")
      .select("key, value")
      .in("key", ["permit_validity_years", "renewal_window_days"])
      .then(({ data }: { data: { key: string; value: unknown }[] | null }) => {
        if (!data) return
        const s = { permit_validity_years: 3, renewal_window_days: 90 }
        for (const row of data) {
          if (row.key === "permit_validity_years") s.permit_validity_years = Number(row.value) || 3
          if (row.key === "renewal_window_days") s.renewal_window_days = Number(row.value) || 90
        }
        setSettings(s)
      })
  }, [supabase])

  const fetchApplications = useCallback(async () => {
    setLoading(true)

    let query = supabase
      .schema("mtop")
      .from("mtop_applications")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })

    if (status !== "all") {
      query = query.eq("status", status as MtopStatus)
    }

    if (search) {
      query = query.or(
        `applicant_name.ilike.%${search}%,application_number.ilike.%${search}%`
      )
    }

    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    query = query.range(from, to)

    const { data, count: totalCount } = await query

    setApplications((data as MtopApplication[]) ?? [])
    setCount(totalCount ?? 0)
    setLoading(false)
  }, [supabase, status, search, page])

  useEffect(() => {
    fetchApplications()
  }, [fetchApplications])

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(urlSearchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
    }
    router.push(`/dashboard/applications?${params.toString()}`)
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    updateParams({ search: searchInput, page: "" })
  }

  // Client-side expiration filtering (when linked from dashboard renewal cards)
  const filteredApplications = expiration
    ? applications.filter((app) => {
        if (app.status !== "granted" || !app.granted_at) return false
        const info = getPermitExpirationInfo(
          app.granted_at,
          settings.permit_validity_years,
          settings.renewal_window_days
        )
        return info.status === expiration
      })
    : applications

  const displayCount = expiration ? filteredApplications.length : count
  const totalPages = Math.ceil(displayCount / PAGE_SIZE)

  return (
    <div className="space-y-4">
      {/* Filters row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={status}
          onValueChange={(value) =>
            updateParams({ status: value === "all" ? "" : (value as string), page: "" })
          }
        >
          <TabsList variant="line">
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search applicant or app #..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-8 w-60 h-8"
            />
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/60 overflow-hidden bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40 border-b border-border/60">
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">Application #</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">Applicant</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 hidden md:table-cell">Body #</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 hidden lg:table-cell">Route</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">Status</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 hidden md:table-cell">Permit Expiry</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 hidden sm:table-cell">Submitted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    Loading applications…
                  </div>
                </TableCell>
              </TableRow>
            ) : applications.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-16 text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm font-medium">No applications found</p>
                    <p className="text-xs text-muted-foreground/70">
                      {search ? `No results for "${search}"` : "No applications match the current filter"}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredApplications.map((app) => {
                const expirationInfo =
                  app.status === "granted" && app.granted_at
                    ? getPermitExpirationInfo(
                        app.granted_at,
                        settings.permit_validity_years,
                        settings.renewal_window_days
                      )
                    : null

                return (
                  <TableRow
                    key={app.id}
                    className="hover:bg-muted/30 transition-colors border-border/40"
                  >
                    <TableCell>
                      <Link
                        href={`/dashboard/applications/${app.id}`}
                        className="font-mono text-xs font-semibold text-primary hover:underline underline-offset-2"
                      >
                        {app.application_number}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      {app.applicant_name}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground hidden md:table-cell">
                      {app.tricycle_body_number || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate hidden lg:table-cell">
                      {app.route || "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={app.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {expirationInfo ? (
                        <ExpirationBadge
                          status={expirationInfo.status}
                          daysRemaining={expirationInfo.daysRemaining}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
                      {formatDistanceToNow(new Date(app.submitted_at), {
                        addSuffix: true,
                      })}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Showing{" "}
            <span className="font-medium text-foreground">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, displayCount)}
            </span>{" "}
            of <span className="font-medium text-foreground">{displayCount}</span>
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page <= 1}
              onClick={() => updateParams({ page: String(page - 1) })}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2 text-xs text-muted-foreground tabular-nums">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page >= totalPages}
              onClick={() => updateParams({ page: String(page + 1) })}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
