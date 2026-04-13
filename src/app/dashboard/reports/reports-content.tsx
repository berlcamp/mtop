"use client"

import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Download, Loader2 } from "lucide-react"
import { getStatusLabel } from "@/components/shared/status-badge"
import { FEE_LABELS } from "@/lib/fees"
import { getApplicationsForExport } from "@/lib/actions/reports"
import type { MtopStatus } from "@/types/database"

const STATUS_ORDER: MtopStatus[] = [
  "for_verification",
  "for_inspection",
  "for_assessment",
  "for_approval",
  "granted",
  "rejected",
  "returned",
]

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

function formatCurrency(amount: number) {
  return `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
}

interface ReportsContentProps {
  statusCounts: Record<string, number> | null
  revenueSummary: Record<string, number> | null
  monthlyTrends: Record<number, { total: number; granted: number }> | null
  lateStats: {
    totalAssessments: number
    lateCount: number
    latePercentage: number
    totalPenalties: number
  } | null
  fiscalYear: number
}

export function ReportsContent({
  statusCounts,
  revenueSummary,
  monthlyTrends,
  lateStats,
  fiscalYear,
}: ReportsContentProps) {
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    setExporting(true)

    const result = await getApplicationsForExport(fiscalYear)
    if (result.error || !result.data) {
      setExporting(false)
      return
    }

    // Build CSV
    const headers = [
      "Application #",
      "Applicant",
      "Address",
      "Contact",
      "Body #",
      "Plate #",
      "Motor #",
      "Chassis #",
      "Route",
      "Status",
      "Fiscal Year",
      "Due Date",
      "Submitted",
      "Granted",
    ]

    const rows = result.data.map(
      (app: {
        application_number: string
        applicant_name: string
        applicant_address: string | null
        contact_number: string | null
        tricycle_body_number: string | null
        plate_number: string | null
        motor_number: string | null
        chassis_number: string | null
        route: string | null
        status: string
        fiscal_year: number
        due_date: string | null
        submitted_at: string
        granted_at: string | null
      }) => [
        app.application_number,
        app.applicant_name,
        app.applicant_address ?? "",
        app.contact_number ?? "",
        app.tricycle_body_number ?? "",
        app.plate_number ?? "",
        app.motor_number ?? "",
        app.chassis_number ?? "",
        app.route ?? "",
        app.status,
        app.fiscal_year,
        app.due_date ?? "",
        app.submitted_at,
        app.granted_at ?? "",
      ]
    )

    const csv = [
      headers.join(","),
      ...rows.map((row: (string | number)[]) =>
        row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n")

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `mtop-applications-${fiscalYear}.csv`
    a.click()
    URL.revokeObjectURL(url)

    setExporting(false)
  }

  const totalApplications = statusCounts
    ? Object.values(statusCounts).reduce((s, v) => s + v, 0)
    : 0

  return (
    <div className="space-y-6">
      {/* Export button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Export to CSV
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Applications by Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Applications by Status</CardTitle>
            <CardDescription>
              {totalApplications} total applications in FY {fiscalYear}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {STATUS_ORDER.map((status) => {
                  const count = statusCounts?.[status] ?? 0
                  const pct =
                    totalApplications > 0
                      ? Math.round((count / totalApplications) * 100)
                      : 0
                  return (
                    <TableRow key={status}>
                      <TableCell>{getStatusLabel(status)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {count}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {pct}%
                      </TableCell>
                    </TableRow>
                  )
                })}
                <TableRow className="font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">
                    {totalApplications}
                  </TableCell>
                  <TableCell className="text-right">100%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Revenue Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Revenue Summary</CardTitle>
            <CardDescription>
              Approved assessments in FY {fiscalYear}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fee Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revenueSummary &&
                  Object.entries(revenueSummary)
                    .filter(([key]) => key !== "total")
                    .filter(([, amount]) => amount > 0)
                    .map(([key, amount]) => (
                      <TableRow key={key}>
                        <TableCell>
                          {FEE_LABELS[key] ?? key}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                {revenueSummary && (
                  <>
                    <TableRow className="font-semibold">
                      <TableCell>Grand Total</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(revenueSummary.total ?? 0)}
                      </TableCell>
                    </TableRow>
                  </>
                )}
                {!revenueSummary && (
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      className="text-center text-muted-foreground"
                    >
                      No data available.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Monthly Renewal Trends */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Monthly Trends</CardTitle>
            <CardDescription>
              Applications submitted and granted per month
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Submitted</TableHead>
                  <TableHead className="text-right">Granted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyTrends &&
                  Object.entries(monthlyTrends).map(
                    ([month, data]) => (
                      <TableRow key={month}>
                        <TableCell>{MONTHS[Number(month) - 1]}</TableCell>
                        <TableCell className="text-right">
                          {data.total}
                        </TableCell>
                        <TableCell className="text-right">
                          {data.granted}
                        </TableCell>
                      </TableRow>
                    )
                  )}
                {!monthlyTrends && (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-muted-foreground"
                    >
                      No data available.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Late Renewal Statistics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Late Renewal Statistics</CardTitle>
            <CardDescription>
              Penalty data for FY {fiscalYear}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {lateStats ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Total Assessments
                    </p>
                    <p className="text-2xl font-bold">
                      {lateStats.totalAssessments}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Late Renewals
                    </p>
                    <p className="text-2xl font-bold">
                      {lateStats.lateCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Late Percentage
                    </p>
                    <p className="text-2xl font-bold">
                      {lateStats.latePercentage}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Total Penalties
                    </p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(lateStats.totalPenalties)}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No data available.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
