"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Calculator,
  AlertCircle,
  Loader2,
  Check,
} from "lucide-react"
import { createAssessment, approveAssessment } from "@/lib/actions/assessments"
import {
  STANDARD_FEES,
  FEE_LABELS,
  calculateLatePenalty,
} from "@/lib/fees"
import type { MtopStatus } from "@/types/database"

interface FeeAssessmentFormProps {
  applicationId: string
  dueDate: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  existingAssessment: any | null
  canAssess: boolean
  canApproveAssessment: boolean
  status: MtopStatus
}

export function FeeAssessmentForm({
  applicationId,
  dueDate,
  existingAssessment,
  canAssess,
  canApproveAssessment,
  status,
}: FeeAssessmentFormProps) {
  // If assessment exists, show read-only view
  if (existingAssessment) {
    return (
      <AssessmentResult
        assessment={existingAssessment}
        applicationId={applicationId}
        canApprove={canApproveAssessment}
        status={status}
      />
    )
  }

  if (status !== "for_assessment" || !canAssess) {
    return null
  }

  return (
    <AssessmentFormInner
      applicationId={applicationId}
      dueDate={dueDate}
    />
  )
}

function AssessmentFormInner({
  applicationId,
  dueDate,
}: {
  applicationId: string
  dueDate: string | null
}) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Standard fees — editable
  const [fees, setFees] = useState<Record<string, number>>({
    ...STANDARD_FEES,
    late_renewal_penalty: dueDate
      ? calculateLatePenalty(new Date(dueDate), new Date())
      : 0,
    change_of_motor_fee: 0,
    replacement_plate_fee: 0,
  })

  // Optional fee toggles
  const [changeOfMotor, setChangeOfMotor] = useState(false)
  const [replacementPlate, setReplacementPlate] = useState(false)

  function updateFee(key: string, value: string) {
    const num = parseFloat(value) || 0
    setFees((prev) => ({ ...prev, [key]: num }))
  }

  function toggleChangeOfMotor(checked: boolean) {
    setChangeOfMotor(checked)
    setFees((prev) => ({
      ...prev,
      change_of_motor_fee: checked ? 1000.0 : 0,
    }))
  }

  function toggleReplacementPlate(checked: boolean) {
    setReplacementPlate(checked)
    setFees((prev) => ({
      ...prev,
      replacement_plate_fee: checked ? 500.0 : 0,
    }))
  }

  const total = useMemo(
    () => Object.values(fees).reduce((sum, v) => sum + v, 0),
    [fees]
  )

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)

    const result = await createAssessment(applicationId, {
      filing_fee: fees.filing_fee,
      supervision_fee: fees.supervision_fee,
      confirmation_fee: fees.confirmation_fee,
      mayors_permit_fee: fees.mayors_permit_fee,
      franchise_fee: fees.franchise_fee,
      police_clearance_fee: fees.police_clearance_fee,
      health_fee: fees.health_fee,
      legal_research_fee: fees.legal_research_fee,
      parking_fee: fees.parking_fee,
      late_renewal_penalty: fees.late_renewal_penalty,
      change_of_motor_fee: fees.change_of_motor_fee,
      replacement_plate_fee: fees.replacement_plate_fee,
    })

    if (result.error) {
      setError(result.error)
      setSubmitting(false)
      return
    }

    router.refresh()
    setSubmitting(false)
  }

  const standardFeeKeys = Object.keys(STANDARD_FEES)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Calculator className="h-4 w-4" />
          Fee Assessment
        </CardTitle>
        <CardDescription>
          Per Ordinance No. 1059-13, Section 4E.02
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Standard fees */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Standard Fees</p>
          {standardFeeKeys.map((key) => (
            <div
              key={key}
              className="flex items-center justify-between gap-4"
            >
              <Label className="text-sm flex-1">{FEE_LABELS[key]}</Label>
              <div className="flex items-center gap-1.5 w-32">
                <span className="text-sm text-muted-foreground">₱</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={fees[key]}
                  onChange={(e) => updateFee(key, e.target.value)}
                  className="text-right h-7 text-sm"
                  disabled={submitting}
                />
              </div>
            </div>
          ))}
        </div>

        <Separator />

        {/* Late renewal penalty */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Late Renewal Penalty</p>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm">{FEE_LABELS.late_renewal_penalty}</Label>
              {dueDate && (
                <p className="text-xs text-muted-foreground">
                  Due date: {dueDate}
                </p>
              )}
              {!dueDate && (
                <p className="text-xs text-muted-foreground">
                  No due date set — penalty defaults to ₱0.00
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 w-32">
              <span className="text-sm text-muted-foreground">₱</span>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={fees.late_renewal_penalty}
                onChange={(e) =>
                  updateFee("late_renewal_penalty", e.target.value)
                }
                className="text-right h-7 text-sm"
                disabled={submitting}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Optional fees */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Other Fees (if applicable)</p>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={changeOfMotor}
                onCheckedChange={(c) => toggleChangeOfMotor(c as boolean)}
                disabled={submitting}
              />
              <Label className="text-sm cursor-pointer">
                {FEE_LABELS.change_of_motor_fee}
              </Label>
            </div>
            <div className="flex items-center gap-1.5 w-32">
              <span className="text-sm text-muted-foreground">₱</span>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={fees.change_of_motor_fee}
                onChange={(e) =>
                  updateFee("change_of_motor_fee", e.target.value)
                }
                className="text-right h-7 text-sm"
                disabled={!changeOfMotor || submitting}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={replacementPlate}
                onCheckedChange={(c) => toggleReplacementPlate(c as boolean)}
                disabled={submitting}
              />
              <Label className="text-sm cursor-pointer">
                {FEE_LABELS.replacement_plate_fee}
              </Label>
            </div>
            <div className="flex items-center gap-1.5 w-32">
              <span className="text-sm text-muted-foreground">₱</span>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={fees.replacement_plate_fee}
                onChange={(e) =>
                  updateFee("replacement_plate_fee", e.target.value)
                }
                className="text-right h-7 text-sm"
                disabled={!replacementPlate || submitting}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Total */}
        <div className="flex items-center justify-between rounded-lg border-2 px-4 py-3">
          <span className="text-sm font-semibold">Total Amount</span>
          <span className="text-lg font-bold">
            ₱{total.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
          </span>
        </div>

        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit Assessment
        </Button>
      </CardContent>
    </Card>
  )
}

function AssessmentResult({
  assessment,
  applicationId,
  canApprove,
  status,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assessment: any
  applicationId: string
  canApprove: boolean
  status: MtopStatus
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isApproved = !!assessment.approved_at

  const feeEntries = [
    ["filing_fee", assessment.filing_fee],
    ["supervision_fee", assessment.supervision_fee],
    ["confirmation_fee", assessment.confirmation_fee],
    ["mayors_permit_fee", assessment.mayors_permit_fee],
    ["franchise_fee", assessment.franchise_fee],
    ["police_clearance_fee", assessment.police_clearance_fee],
    ["health_fee", assessment.health_fee],
    ["legal_research_fee", assessment.legal_research_fee],
    ["parking_fee", assessment.parking_fee],
    ["late_renewal_penalty", assessment.late_renewal_penalty],
    ["change_of_motor_fee", assessment.change_of_motor_fee],
    ["replacement_plate_fee", assessment.replacement_plate_fee],
  ].filter(([, amount]) => Number(amount) > 0) as [string, number][]

  async function handleApprove() {
    setLoading(true)
    setError(null)

    const result = await approveAssessment(assessment.id, applicationId)
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
          <Calculator className="h-4 w-4" />
          Fee Assessment
        </CardTitle>
        <CardDescription>
          Assessed by {assessment.assessor?.full_name ?? "—"}
          {isApproved && (
            <Badge className="ml-2 bg-green-100 text-green-800 hover:bg-green-100 text-xs">
              <Check className="mr-1 h-3 w-3" />
              Approved
            </Badge>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Fee breakdown */}
        {feeEntries.map(([key, amount]) => (
          <div
            key={key}
            className="flex items-center justify-between text-sm"
          >
            <span className="text-muted-foreground">{FEE_LABELS[key]}</span>
            <span>
              ₱{Number(amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
            </span>
          </div>
        ))}

        <Separator />

        <div className="flex items-center justify-between font-semibold">
          <span>Total</span>
          <span>
            ₱{Number(assessment.total_amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
          </span>
        </div>

        {/* CTO Head approval action */}
        {status === "for_assessment" && !isApproved && canApprove && (
          <div className="pt-2">
            <Button onClick={handleApprove} disabled={loading}>
              {loading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Approve Assessment
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
