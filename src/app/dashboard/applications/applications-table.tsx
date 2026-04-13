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
import { Search, ChevronLeft, ChevronRight } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { createClient } from "@/lib/supabase/client"
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

  const supabase = createClient()

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

  const totalPages = Math.ceil(count / PAGE_SIZE)

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search applicant or app #..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-8 w-64"
            />
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Application #</TableHead>
              <TableHead>Applicant</TableHead>
              <TableHead>Body #</TableHead>
              <TableHead>Route</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Submitted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : applications.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No applications found.
                </TableCell>
              </TableRow>
            ) : (
              applications.map((app) => (
                <TableRow key={app.id}>
                  <TableCell>
                    <Link
                      href={`/dashboard/applications/${app.id}`}
                      className="font-mono text-sm text-primary hover:underline"
                    >
                      {app.application_number}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">
                    {app.applicant_name}
                  </TableCell>
                  <TableCell className="font-mono">
                    {app.tricycle_body_number}
                  </TableCell>
                  <TableCell>{app.route}</TableCell>
                  <TableCell>
                    <StatusBadge status={app.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDistanceToNow(new Date(app.submitted_at), {
                      addSuffix: true,
                    })}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, count)} of {count}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => updateParams({ page: String(page - 1) })}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => updateParams({ page: String(page + 1) })}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
