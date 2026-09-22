"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  ClipboardCheck,
  AlertCircle,
  Loader2,
  Check,
  X,
  RotateCcw,
} from "lucide-react"
import { useProfile } from "@/lib/hooks/use-profile"
import { createInspection } from "@/lib/actions/inspections"
import { INSPECTION_FIELDS, INSPECTION_LABELS } from "@/lib/inspection"
import { updateApplicationStatus } from "@/lib/actions/applications"
import type { MtopStatus } from "@/types/database"

interface InspectionChecklistProps {
  applicationId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  existingInspection: any | null
  canInspect: boolean
  status: MtopStatus
}

export function InspectionChecklist({
  applicationId,
  existingInspection,
  canInspect,
  status,
}: InspectionChecklistProps) {
  const { profile } = useProfile()
  const [reinspecting, setReinspecting] = useState(false)

  // Recording an inspection is allowed whenever the application is sitting at
  // this stage — including after it was returned for a failed inspection and
  // then reopened, which is the whole point of reopening it.
  const canRecord = status === "for_inspection" && canInspect

  // An inspection already on file is shown as a result, not a form. It stays
  // that way unless the inspector explicitly starts a re-inspection: the row
  // is history, and createInspection() writes a new one rather than editing it.
  if (existingInspection && !reinspecting) {
    return (
      <InspectionResult
        inspection={existingInspection}
        applicationId={applicationId}
        canInspect={canInspect}
        status={status}
        onReinspect={canRecord ? () => setReinspecting(true) : undefined}
      />
    )
  }

  // Only show form if status is for_inspection and user can inspect
  if (!canRecord) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            Physical Inspection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No inspection has been conducted yet.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <InspectionForm
      applicationId={applicationId}
      inspectorName={profile?.full_name ?? ""}
      // A re-inspection starts from what the last one found, so the inspector
      // ticks off only what has since been put right.
      previous={existingInspection}
      onCancel={existingInspection ? () => setReinspecting(false) : undefined}
      onSaved={() => setReinspecting(false)}
    />
  )
}

function InspectionForm({
  applicationId,
  inspectorName,
  previous,
  onCancel,
  onSaved,
}: {
  applicationId: string
  inspectorName: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  previous?: any | null
  onCancel?: () => void
  onSaved?: () => void
}) {
  const router = useRouter()
  const [checklist, setChecklist] = useState<Record<string, boolean>>(
    Object.fromEntries(
      INSPECTION_FIELDS.map((f) => [f, previous ? previous[f] === true : false])
    )
  )
  // Remarks start empty even on a re-inspection: the previous ones are the
  // auto-generated "Failed items: …" line, which describes the old visit.
  const [remarks, setRemarks] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allPassed = INSPECTION_FIELDS.every((f) => checklist[f])
  const passedCount = INSPECTION_FIELDS.filter((f) => checklist[f]).length
  const today = new Date().toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  function toggleItem(field: string, checked: boolean) {
    setChecklist((prev) => ({ ...prev, [field]: checked }))
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)

    const result = await createInspection(applicationId, {
      ...checklist,
      remarks: remarks || undefined,
    } as Parameters<typeof createInspection>[1])

    if (result.error) {
      setError(result.error)
      setSubmitting(false)
      return
    }

    router.refresh()
    setSubmitting(false)
    // Back to the result view, which the refresh has just repointed at the
    // inspection that was only now recorded.
    onSaved?.()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4" />
          {previous ? "Re-inspection" : "Physical Inspection"}
        </CardTitle>
        <CardDescription>
          12-point tricycle inspection — {passedCount}/{INSPECTION_FIELDS.length}{" "}
          items passed
          {previous && (
            <> · starting from what the last inspection found</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Inspector info */}
        <div className="flex gap-6 text-sm text-muted-foreground">
          <span>
            Inspector: <strong className="text-foreground">{inspectorName}</strong>
          </span>
          <span>
            Date: <strong className="text-foreground">{today}</strong>
          </span>
        </div>

        {/* Checklist */}
        <div className="space-y-2">
          {INSPECTION_FIELDS.map((field, index) => (
            <div
              key={field}
              className="flex items-center gap-3 rounded-lg border px-4 py-2.5"
            >
              <span className="text-xs text-muted-foreground w-5 text-right shrink-0">
                {index + 1}.
              </span>
              <Checkbox
                checked={checklist[field]}
                onCheckedChange={(checked) =>
                  toggleItem(field, checked as boolean)
                }
                disabled={submitting}
              />
              <Label className="text-sm cursor-pointer flex-1">
                {INSPECTION_LABELS[field]}
              </Label>
              <Badge
                variant={checklist[field] ? "default" : "secondary"}
                className="text-xs"
              >
                {checklist[field] ? "Pass" : "Fail"}
              </Badge>
            </div>
          ))}
        </div>

        {/* Auto-computed result */}
        <div className="flex items-center gap-2 rounded-lg border-2 px-4 py-3">
          <span className="text-sm font-medium">Overall Result:</span>
          <Badge
            variant={allPassed ? "default" : "secondary"}
            className={
              allPassed
                ? "bg-green-100 text-green-800 hover:bg-green-100"
                : "bg-red-100 text-red-800 hover:bg-red-100"
            }
          >
            {allPassed ? "PASSED" : "FAILED"}
          </Badge>
        </div>

        {/* Remarks */}
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="inspection-remarks">
            General Remarks
          </label>
          <textarea
            id="inspection-remarks"
            className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 min-h-[80px]"
            placeholder="Add inspection remarks..."
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            disabled={submitting}
          />
        </div>

        {/* Submit */}
        <div className="flex gap-2">
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {previous ? "Submit Re-inspection" : "Submit Inspection"}
          </Button>
          {onCancel && (
            <Button variant="outline" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function InspectionResult({
  inspection,
  applicationId,
  canInspect,
  status,
  onReinspect,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inspection: any
  applicationId: string
  canInspect: boolean
  status: MtopStatus
  /** Set only when this stage is open to the inspector; absent otherwise. */
  onReinspect?: () => void
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isPassed = inspection.result === "passed"

  async function handleForward() {
    setLoading(true)
    setError(null)

    const result = await updateApplicationStatus(
      applicationId,
      "for_assessment",
      "forwarded",
      "Inspection passed — forwarded to assessment"
    )

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    router.refresh()
    setLoading(false)
  }

  async function handleFailReturn() {
    setLoading(true)
    setError(null)

    const result = await updateApplicationStatus(
      applicationId,
      "returned",
      "returned",
      inspection.remarks || "Inspection failed"
    )

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    router.refresh()
    setLoading(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4" />
          Physical Inspection
        </CardTitle>
        <CardDescription>
          Inspected by {inspection.inspector?.full_name ?? "—"} on{" "}
          {inspection.inspection_date}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Result summary */}
        <div className="flex items-center gap-2 rounded-lg border-2 px-4 py-3">
          <span className="text-sm font-medium">Result:</span>
          <Badge
            variant="default"
            className={
              isPassed
                ? "bg-green-100 text-green-800 hover:bg-green-100"
                : "bg-red-100 text-red-800 hover:bg-red-100"
            }
          >
            {isPassed ? "PASSED" : "FAILED"}
          </Badge>
        </div>

        {/* Checklist read-only */}
        <div className="grid gap-1.5 sm:grid-cols-2">
          {INSPECTION_FIELDS.map((field) => (
            <div key={field} className="flex items-center gap-2 text-sm">
              {inspection[field] ? (
                <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
              ) : (
                <X className="h-3.5 w-3.5 text-red-600 shrink-0" />
              )}
              <span
                className={
                  inspection[field] ? "text-foreground" : "text-red-600"
                }
              >
                {INSPECTION_LABELS[field]}
              </span>
            </div>
          ))}
        </div>

        {/* Remarks */}
        {inspection.remarks && (
          <div className="rounded-lg bg-muted px-3 py-2">
            <p className="text-xs text-muted-foreground mb-1">Remarks</p>
            <p className="text-sm">{inspection.remarks}</p>
          </div>
        )}

        {/* Actions — only at for_inspection stage */}
        {status === "for_inspection" && canInspect && (
          <div className="flex flex-wrap gap-2 pt-2">
            {/* A failed unit that has been fixed is re-inspected, not edited:
                the failed visit stays on record and a fresh row is written.
                Without this an application returned for a failed inspection
                had nowhere to go once it was reopened. */}
            {onReinspect && (
              <Button variant={isPassed ? "outline" : "default"} onClick={onReinspect}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Re-inspect
              </Button>
            )}
            {isPassed && (
              <Button onClick={handleForward} disabled={loading}>
                {loading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Forward to Assessment
              </Button>
            )}
            {!isPassed && (
              <Button
                variant="destructive"
                onClick={handleFailReturn}
                disabled={loading}
              >
                {loading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Fail &amp; Return
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
