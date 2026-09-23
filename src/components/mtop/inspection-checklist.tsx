"use client"

import { useRef, useState } from "react"
import { useGuardedAction } from "@/components/shared/guarded-action"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  ClipboardCheck,
  AlertCircle,
  Loader2,
  Check,
  X,
  RotateCcw,
  ArrowRight,
  Undo2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useProfile } from "@/lib/hooks/use-profile"
import { createInspection } from "@/lib/actions/inspections"
import { INSPECTION_FIELDS, INSPECTION_LABELS } from "@/lib/inspection"
import { updateApplicationStatus } from "@/lib/actions/applications"
import type { MtopStatus } from "@/types/database"

/** Neither passed nor failed yet — the state a fresh form starts every row in. */
type Verdict = boolean | null

interface InspectionChecklistProps {
  applicationId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  existingInspection: any | null
  canInspect: boolean
  status: MtopStatus
  /** Administrators may correct the inspection at any stage before granting. */
  adminEdit?: boolean
}

export function InspectionChecklist({
  applicationId,
  existingInspection,
  canInspect,
  status,
  adminEdit = false,
}: InspectionChecklistProps) {
  // Recording an inspection is allowed whenever the application is sitting at
  // this stage — including after it was returned for a failed inspection and
  // then reopened, which is the whole point of reopening it — and, for an
  // administrator, at any stage until the permit is granted.
  const canRecord = (status === "for_inspection" || adminEdit) && canInspect

  if (existingInspection) {
    return (
      <InspectionResult
        inspection={existingInspection}
        applicationId={applicationId}
        canInspect={canInspect}
        status={status}
        canRecord={canRecord}
      />
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          Physical Inspection
        </CardTitle>
        <CardDescription>
          Twelve-point roadworthiness check of the unit
        </CardDescription>
        {canRecord && (
          <CardAction>
            <InspectionDialog
              applicationId={applicationId}
              previous={null}
              trigger={
                <Button size="sm">
                  <ClipboardCheck className="mr-1.5" />
                  Record inspection
                </Button>
              }
            />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-dashed px-4 py-8 text-center">
          <ClipboardCheck className="mx-auto mb-2 size-5 text-muted-foreground/60" />
          <p className="text-sm font-medium">Not yet inspected</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
            {canRecord
              ? "The unit passes on all twelve points or it is returned to the operator for repair. A later visit is recorded as a re-inspection; the failed one stays on record."
              : "An inspector records the twelve-point check once the unit is presented at the motor pool."}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------------- */
/* Result on file                                                            */
/* ------------------------------------------------------------------------- */

function InspectionResult({
  inspection,
  applicationId,
  canInspect,
  status,
  canRecord,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inspection: any
  applicationId: string
  canInspect: boolean
  status: MtopStatus
  canRecord: boolean
}) {
  const guard = useGuardedAction()
  const [loading, setLoading] = useState<"forward" | "return" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isPassed = inspection.result === "passed"
  const failedCount = INSPECTION_FIELDS.filter((f) => !inspection[f]).length
  const atStage = status === "for_inspection" && canInspect

  async function handleForward() {
    const ok = await guard.confirm({
      title: "Forward to Assessment?",
      description: "The unit passed inspection and moves on to fee assessment.",
      confirmLabel: "Forward",
    })
    if (!ok) return

    guard.start("Forwarding to Assessment…")
    setLoading("forward")
    setError(null)

    const result = await updateApplicationStatus(
      applicationId,
      "for_assessment",
      "forwarded",
      "Inspection passed — forwarded to assessment"
    )

    if (result.error) {
      setError(result.error)
      setLoading(null)
      guard.stop()
      return
    }

    guard.finish()
    setLoading(null)
  }

  async function handleFailReturn() {
    const ok = await guard.confirm({
      title: "Return to the operator?",
      description:
        "The application is paused until the failed points are repaired, then re-inspected.",
      confirmLabel: "Return",
      destructive: true,
    })
    if (!ok) return

    guard.start("Returning the application…")
    setLoading("return")
    setError(null)

    const result = await updateApplicationStatus(
      applicationId,
      "returned",
      "returned",
      inspection.remarks || "Inspection failed"
    )

    if (result.error) {
      setError(result.error)
      setLoading(null)
      guard.stop()
      return
    }

    guard.finish()
    setLoading(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          Physical Inspection
        </CardTitle>
        <CardDescription>
          Inspected by {inspection.inspector?.full_name ?? "—"} on{" "}
          {inspection.inspection_date}
        </CardDescription>
        {/* A failed unit that has been fixed is re-inspected, not edited: the
            failed visit stays on record and a fresh row is written. Without
            this an application returned for a failed inspection had nowhere to
            go once it was reopened. */}
        {canRecord && (
          <CardAction>
            <InspectionDialog
              applicationId={applicationId}
              previous={inspection}
              trigger={
                <Button variant={isPassed ? "outline" : "default"} size="sm">
                  <RotateCcw className="mr-1.5" />
                  Re-inspect
                </Button>
              }
            />
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <ResultBanner passed={isPassed} failedCount={failedCount} />

        <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {INSPECTION_FIELDS.map((field) => {
            const ok = inspection[field]
            return (
              <li key={field} className="flex items-start gap-2 text-sm">
                {ok ? (
                  <Check
                    className="mt-0.5 size-3.5 shrink-0 text-green-700"
                    strokeWidth={3}
                    aria-hidden
                  />
                ) : (
                  <X
                    className="mt-0.5 size-3.5 shrink-0 text-red-600"
                    strokeWidth={3}
                    aria-hidden
                  />
                )}
                <span
                  className={cn(
                    "leading-snug",
                    ok ? "text-muted-foreground" : "font-medium text-red-700"
                  )}
                >
                  {INSPECTION_LABELS[field]}
                  <span className="sr-only">{ok ? " — passed" : " — failed"}</span>
                </span>
              </li>
            )
          })}
        </ul>

        {inspection.remarks && (
          <div className="rounded-lg bg-muted px-3 py-2.5">
            <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Remarks
            </p>
            <p className="text-sm leading-relaxed">{inspection.remarks}</p>
          </div>
        )}

        {atStage && (
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {isPassed ? (
              <Button onClick={handleForward} disabled={loading !== null}>
                {loading === "forward" ? (
                  <Loader2 className="mr-1.5 animate-spin" />
                ) : (
                  <ArrowRight className="mr-1.5" />
                )}
                Forward to Assessment
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={handleFailReturn}
                disabled={loading !== null}
              >
                {loading === "return" ? (
                  <Loader2 className="mr-1.5 animate-spin" />
                ) : (
                  <Undo2 className="mr-1.5" />
                )}
                Return to operator
              </Button>
            )}
          </div>
        )}
      </CardContent>
      {guard.element}
    </Card>
  )
}

function ResultBanner({
  passed,
  failedCount,
}: {
  passed: boolean
  failedCount: number
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg px-3.5 py-3 ring-1",
        passed
          ? "bg-green-50 text-green-900 ring-green-200"
          : "bg-red-50 text-red-900 ring-red-200"
      )}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full text-white",
          passed ? "bg-green-700" : "bg-red-600"
        )}
      >
        {passed ? (
          <Check className="size-4" strokeWidth={3} />
        ) : (
          <X className="size-4" strokeWidth={3} />
        )}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{passed ? "Passed" : "Failed"}</p>
        <p className="text-xs opacity-80">
          {passed
            ? "All twelve points in order."
            : `${failedCount} of ${INSPECTION_FIELDS.length} points need putting right.`}
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------- */
/* Recording dialog                                                          */
/* ------------------------------------------------------------------------- */

/**
 * The twelve-point check, recorded in one sitting.
 *
 * Every point is an explicit Pass or Fail rather than a checkbox that means
 * "failed" until it is ticked: an untouched form used to read as twelve
 * failures and could be submitted as one, which is not what an inspector who
 * had not looked yet meant to attest. The form will not submit until all
 * twelve have been decided.
 */
function InspectionDialog({
  applicationId,
  previous,
  trigger,
}: {
  applicationId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  previous: any | null
  trigger: React.ReactElement
}) {
  const guard = useGuardedAction()
  const { profile } = useProfile()

  const [open, setOpen] = useState(false)
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({})
  const [remarks, setRemarks] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Opening a dialog focuses its first control, which put a focus ring on the
  // first row's Pass button and read as a verdict already chosen.
  const scrollRef = useRef<HTMLDivElement>(null)

  const decided = INSPECTION_FIELDS.filter((f) => verdicts[f] !== null && verdicts[f] !== undefined)
  const undecided = INSPECTION_FIELDS.length - decided.length
  const allPassed = INSPECTION_FIELDS.every((f) => verdicts[f] === true)

  const today = new Date().toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  function handleOpenChange(next: boolean) {
    // The overlay sits outside this dialog, so a click on it reads as a click
    // outside — which must not close the form mid-save.
    if (!next && guard.busy) return
    if (next) {
      // A re-inspection starts from what the last visit found, so the inspector
      // ticks off only what has since been put right. A first visit starts
      // undecided on every point.
      setVerdicts(
        Object.fromEntries(
          INSPECTION_FIELDS.map((f) => [
            f,
            previous ? previous[f] === true : null,
          ])
        )
      )
      // Remarks start empty even on a re-inspection: the previous ones are the
      // auto-generated "Failed items: …" line, which describes the old visit.
      setRemarks("")
      setError(null)
      setSubmitting(false)
    }
    setOpen(next)
  }

  async function handleSubmit() {
    const ok = await guard.confirm({
      title: previous ? "Record this re-inspection?" : "Record this inspection?",
      description: allPassed
        ? "The unit passes on every point."
        : `The unit fails on ${INSPECTION_FIELDS.length - INSPECTION_FIELDS.filter((f) => verdicts[f] === true).length} point(s) and goes back to the operator for repair.`,
      confirmLabel: "Record",
    })
    if (!ok) return

    guard.start("Recording the inspection…")
    setSubmitting(true)
    setError(null)

    const result = await createInspection(applicationId, {
      ...(Object.fromEntries(
        INSPECTION_FIELDS.map((f) => [f, verdicts[f] === true])
      ) as Record<string, boolean>),
      remarks: remarks || undefined,
    } as Parameters<typeof createInspection>[1])

    if (result.error) {
      setError(result.error)
      setSubmitting(false)
      guard.stop()
      return
    }

    guard.finish()
    setSubmitting(false)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />

      {/* `grid-cols-[minmax(0,1fr)]` is load-bearing: without an explicit
          column the grid sizes to its widest child's max-content and the whole
          dialog runs off the right edge of a phone. */}
      <DialogContent
        className="grid max-h-[min(50rem,90vh)] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 sm:max-w-2xl"
        initialFocus={scrollRef}
      >
        <DialogHeader className="gap-2 border-b pb-4">
          <DialogTitle>
            {previous ? "Re-inspection" : "Physical inspection"}
          </DialogTitle>
          <DialogDescription>
            {profile?.full_name ?? "Inspector"} · {today}
            {previous && <> · starting from what the last visit found</>}
          </DialogDescription>
          <div className="flex items-center gap-3 pt-1">
            <div
              role="progressbar"
              aria-valuenow={decided.length}
              aria-valuemin={0}
              aria-valuemax={INSPECTION_FIELDS.length}
              aria-label="Points recorded"
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted ring-1 ring-foreground/5 ring-inset"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                style={{
                  width: `${(decided.length / INSPECTION_FIELDS.length) * 100}%`,
                }}
              />
            </div>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {decided.length}/{INSPECTION_FIELDS.length}
            </span>
          </div>
        </DialogHeader>

        <div
          ref={scrollRef}
          tabIndex={-1}
          className="-mx-5 min-h-0 overflow-y-auto px-5 py-4 outline-none"
        >
          <ul className="space-y-1.5">
            {INSPECTION_FIELDS.map((field, index) => (
              <VerdictRow
                key={field}
                index={index}
                field={field}
                value={verdicts[field] ?? null}
                onChange={(v) =>
                  setVerdicts((prev) => ({ ...prev, [field]: v }))
                }
                disabled={submitting}
              />
            ))}
          </ul>

          <div className="mt-5 space-y-1.5">
            <label
              className="text-sm font-medium"
              htmlFor="inspection-remarks"
            >
              General remarks
            </label>
            <Textarea
              id="inspection-remarks"
              className="min-h-20 text-sm"
              placeholder="Anything the assessor or the operator should know about this visit."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground">
              Failed points are listed in the record automatically — this is for
              what the list does not say.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col! items-stretch gap-3 sm:flex-row! sm:items-center">
          {error ? (
            <p className="flex items-start gap-1.5 text-xs text-destructive sm:mr-auto">
              <AlertCircle className="mt-px size-3.5 shrink-0" />
              <span>{error}</span>
            </p>
          ) : undecided > 0 ? (
            <p className="text-xs text-muted-foreground sm:mr-auto">
              {undecided} {undecided === 1 ? "point" : "points"} still to record
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-xs sm:mr-auto">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  allPassed ? "bg-green-600" : "bg-red-600"
                )}
              />
              <span className="font-medium">
                {allPassed ? "Passes" : "Fails"}
              </span>
              <span className="text-muted-foreground">
                {allPassed
                  ? "— forward to assessment next"
                  : "— returns to the operator for repair"}
              </span>
            </p>
          )}

          <div className="flex gap-2 *:flex-1 sm:*:flex-none">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || undecided > 0}>
              {submitting && <Loader2 className="mr-1.5 animate-spin" />}
              {submitting
                ? "Recording…"
                : previous
                  ? "Record re-inspection"
                  : "Record inspection"}
            </Button>
          </div>
        </DialogFooter>
        {guard.confirmDialog}
      </DialogContent>
      {guard.overlay}
    </Dialog>
  )
}

function VerdictRow({
  index,
  field,
  value,
  onChange,
  disabled,
}: {
  index: number
  field: string
  value: Verdict
  onChange: (value: boolean) => void
  disabled: boolean
}) {
  const label = INSPECTION_LABELS[field]

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 ring-1 transition-colors",
        value === null
          ? "ring-border"
          : value
            ? "bg-green-50/60 ring-green-200"
            : "bg-red-50/60 ring-red-200"
      )}
    >
      <span className="w-5 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
        {index + 1}
      </span>
      <span className="min-w-0 flex-1 text-sm leading-snug" id={`${field}-label`}>
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={`${field}-label`}
        className="inline-flex shrink-0 rounded-lg bg-muted p-0.5 ring-1 ring-foreground/5 ring-inset"
      >
        <VerdictOption
          field={field}
          label="Pass"
          selected={value === true}
          onSelect={() => onChange(true)}
          disabled={disabled}
          activeClassName="bg-green-800 text-white"
        />
        <VerdictOption
          field={field}
          label="Fail"
          selected={value === false}
          onSelect={() => onChange(false)}
          disabled={disabled}
          activeClassName="bg-red-600 text-white"
        />
      </div>
    </li>
  )
}

function VerdictOption({
  field,
  label,
  selected,
  onSelect,
  disabled,
  activeClassName,
}: {
  field: string
  label: string
  selected: boolean
  onSelect: () => void
  disabled: boolean
  activeClassName: string
}) {
  return (
    <label className="relative cursor-pointer has-disabled:cursor-not-allowed has-disabled:opacity-50">
      <input
        type="radio"
        name={`verdict-${field}`}
        className="peer sr-only"
        checked={selected}
        onChange={onSelect}
        disabled={disabled}
      />
      <span
        className={cn(
          "block rounded-[min(var(--radius-md),10px)] px-2.5 py-1 text-xs font-medium transition-colors peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
          selected
            ? activeClassName
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        {label}
      </span>
    </label>
  )
}
