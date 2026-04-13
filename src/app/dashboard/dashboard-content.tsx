"use client"

import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge, getStatusLabel } from "@/components/shared/status-badge"
import {
  FileText,
  Clock,
  CheckCircle,
  Banknote,
  ArrowRight,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { MtopStatus, ApprovalAction } from "@/types/database"

interface DashboardStats {
  totalApplications: number
  pending: number
  granted: number
  revenue: number
}

interface PipelineItem {
  status: MtopStatus
  count: number
}

interface ActivityEntry {
  id: string
  stage: MtopStatus
  action: ApprovalAction
  remarks: string | null
  created_at: string
  actor?: { id: string; full_name: string } | null
  application?: {
    application_number: string
    applicant_name: string
  } | null
}

const statCards = [
  {
    key: "totalApplications" as const,
    title: "Total Applications",
    icon: FileText,
    description: "Current year",
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: "pending" as const,
    title: "Pending",
    icon: Clock,
    description: "In process",
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: "granted" as const,
    title: "Granted",
    icon: CheckCircle,
    description: "This year",
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: "revenue" as const,
    title: "Revenue",
    icon: Banknote,
    description: "Total collected",
    format: (v: number) =>
      `₱${v.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
  },
]

const actionColors: Record<ApprovalAction, string> = {
  approved: "bg-green-500",
  forwarded: "bg-blue-500",
  rejected: "bg-red-500",
  returned: "bg-orange-500",
}

export function DashboardContent({
  stats,
  pipeline,
  activity,
}: {
  stats: DashboardStats | null
  pipeline: PipelineItem[] | null
  activity: ActivityEntry[] | null
}) {
  return (
    <>
      {/* Stats grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.key}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats ? stat.format(stats[stat.key]) : "—"}
              </div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pipeline view */}
      {pipeline && pipeline.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              {pipeline.map((item, index) => (
                <div key={item.status} className="flex items-center gap-2">
                  <Link
                    href={`/dashboard/applications?status=${item.status}`}
                    className="flex items-center gap-2 rounded-lg border px-4 py-2.5 hover:bg-muted transition-colors"
                  >
                    <StatusBadge status={item.status} />
                    <span className="text-lg font-bold">{item.count}</span>
                  </Link>
                  {index < pipeline.length - 1 && (
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {!activity || activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <div className="space-y-4">
              {activity.map((entry, index) => (
                <div key={entry.id} className="flex gap-3">
                  {/* Timeline dot + line */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`h-2.5 w-2.5 rounded-full mt-1.5 shrink-0 ${actionColors[entry.action]}`}
                    />
                    {index < activity.length - 1 && (
                      <div className="w-px flex-1 bg-border mt-1" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="pb-4 min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">
                        {entry.actor?.full_name ?? "System"}
                      </span>{" "}
                      <span className="text-muted-foreground capitalize">
                        {entry.action}
                      </span>{" "}
                      {entry.application && (
                        <>
                          <Link
                            href={`/dashboard/applications?search=${entry.application.application_number}`}
                            className="font-mono text-primary hover:underline"
                          >
                            {entry.application.application_number}
                          </Link>{" "}
                          <span className="text-muted-foreground">
                            ({entry.application.applicant_name})
                          </span>
                        </>
                      )}
                      {" "}
                      <span className="text-muted-foreground">at</span>{" "}
                      <span className="font-medium">
                        {getStatusLabel(entry.stage)}
                      </span>
                    </p>
                    {entry.remarks && (
                      <p className="text-sm text-muted-foreground mt-0.5 truncate max-w-md">
                        {entry.remarks}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(entry.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
