"use client"

import Link from "next/link"
import { format } from "date-fns"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge } from "@/components/shared/status-badge"
import { ExpirationBadge } from "@/components/shared/expiration-badge"
import { HistoryTimeline } from "@/components/shared/history-timeline"
import { ReadOnlyField } from "@/app/dashboard/applications/new/read-only-field"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"
import { AlertCircle, ArrowLeft } from "lucide-react"
import { getExpirationStatus } from "@/lib/utils/permit-expiration"
import type { FranchiseHistoryEvent } from "@/lib/audit"
import type { MtopFranchise, MtopApplication, MtopStatus, TransactionType } from "@/types/database"

export type FranchiseRecord = MtopFranchise & {
  association?: { id: string; name: string } | null
  creator?: { id: string; full_name: string | null } | null
}

export type FranchiseTransaction = MtopApplication & {
  transaction_type?: Pick<TransactionType, "id" | "code" | "name"> | null
}

const franchiseStatusLabels: Record<string, string> = {
  active: "Active",
  closed: "Closed",
  abandoned: "Abandoned",
  revoked: "Revoked",
  cancelled: "Cancelled",
}

/**
 * The franchise record — the operator's permanent file, as opposed to any one
 * transaction filed against it. An MTOP number outlives every application
 * attached to it, so this is where its identity, its current unit and driver,
 * and its full audit trail live.
 */
export function FranchiseDetail({
  franchise,
  applications,
  history,
  historyError,
  renewalWindowDays,
}: {
  franchise: FranchiseRecord
  applications: FranchiseTransaction[]
  history: FranchiseHistoryEvent[]
  historyError: string | null
  renewalWindowDays: number
}) {
  const expiration = franchise.granted_until
    ? getExpirationStatus(franchise.granted_until, renewalWindowDays)
    : null

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/applications"
        className={buttonVariants({
          variant: "ghost",
          size: "sm",
          className: "gap-1.5 -ml-2",
        })}
      >
        <ArrowLeft className="h-4 w-4" /> Back to applications
      </Link>

      <PageHeader
        title={franchise.mtop_number ?? "Unnumbered franchise"}
        subtitle={franchise.applicant_name}
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
              {franchiseStatusLabels[franchise.franchise_status] ??
                franchise.franchise_status}
            </span>
            {expiration && (
              <ExpirationBadge
                status={expiration.status}
                daysRemaining={expiration.daysRemaining}
              />
            )}
          </div>
        }
      />

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Operator</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4 sm:grid-cols-2 text-sm">
                  <ReadOnlyField label="Name" value={franchise.applicant_name} />
                  <ReadOnlyField
                    label="Contact number"
                    value={franchise.contact_number}
                  />
                  <div className="sm:col-span-2">
                    <ReadOnlyField
                      label="Address"
                      value={franchise.applicant_address}
                    />
                  </div>
                  <ReadOnlyField
                    label="Association"
                    value={franchise.association?.name ?? "No association (striker)"}
                  />
                  <ReadOnlyField
                    label="Renewal due"
                    value={
                      franchise.granted_until
                        ? format(new Date(franchise.granted_until), "MMM d, yyyy")
                        : null
                    }
                  />
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Driver</CardTitle>
                <CardDescription>
                  The driver currently on file for this franchise. Every change
                  to these fields is kept under History.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4 sm:grid-cols-2 text-sm">
                  <ReadOnlyField label="Name" value={franchise.driver_name} />
                  <ReadOnlyField
                    label="Licence number"
                    value={franchise.driver_license_number}
                    mono
                  />
                  <div className="sm:col-span-2">
                    <ReadOnlyField
                      label="Address"
                      value={franchise.driver_address}
                    />
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Unit</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4 sm:grid-cols-2 text-sm">
                  <ReadOnlyField
                    label="Motor number"
                    value={franchise.motor_number}
                    mono
                  />
                  <ReadOnlyField
                    label="Chassis number"
                    value={franchise.chassis_number}
                    mono
                  />
                  <ReadOnlyField
                    label="Plate number"
                    value={franchise.plate_number}
                    mono
                  />
                  <ReadOnlyField
                    label="Body number"
                    value={franchise.tricycle_body_number}
                    mono
                  />
                  <ReadOnlyField label="Make" value={franchise.make} />
                  <ReadOnlyField label="Day off" value={franchise.day_off} />
                  <div className="sm:col-span-2">
                    <ReadOnlyField label="Route" value={franchise.route} />
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Transactions</CardTitle>
                <CardDescription>
                  Every transaction filed against this franchise, newest first.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {applications.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No transactions filed yet.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {applications.map((app) => (
                      <li
                        key={app.id}
                        className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <Link
                            href={`/dashboard/applications/${app.id}`}
                            className="text-sm font-medium hover:underline underline-offset-2"
                          >
                            {app.transaction_type?.name ?? "Transaction"}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            Filed{" "}
                            {format(new Date(app.submitted_at), "MMM d, yyyy")}
                          </p>
                        </div>
                        <StatusBadge status={app.status as MtopStatus} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Audit trail</CardTitle>
              <CardDescription>
                Every recorded change to this franchise — operator, driver,
                unit and status — alongside the transactions and approvals that
                accompanied them.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {historyError ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{historyError}</AlertDescription>
                </Alert>
              ) : (
                <HistoryTimeline events={history} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
