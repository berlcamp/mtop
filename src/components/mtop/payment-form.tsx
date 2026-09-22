"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Banknote, AlertCircle, Loader2 } from "lucide-react"
import { useProfile } from "@/lib/hooks/use-profile"
import {
  paymentSchema,
  type PaymentFormInput,
  type PaymentFormValues,
} from "@/lib/schemas/mtop"
import { recordPayment } from "@/lib/actions/payments"
import type { MtopStatus } from "@/types/database"

interface PaymentFormProps {
  applicationId: string
  assessmentId: string
  totalAmount: number
  isAssessmentApproved: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  existingPayments: any[]
  canRecord: boolean
  status: MtopStatus
  /** Administrators may record a payment at any stage before granting. */
  adminEdit?: boolean
}

export function PaymentForm({
  applicationId,
  assessmentId,
  totalAmount,
  isAssessmentApproved,
  existingPayments,
  canRecord,
  status,
  adminEdit = false,
}: PaymentFormProps) {
  const [recordingAnother, setRecordingAnother] = useState(false)

  // Recording belongs to the assessment stage, and to an administrator at any
  // stage before the permit is granted. The assessment still has to be
  // approved first — what is owed is not a matter of opinion.
  const canRecordNow =
    (status === "for_assessment" || adminEdit) &&
    isAssessmentApproved &&
    canRecord

  // Show existing payments if any
  if (existingPayments.length > 0 && !recordingAnother) {
    return (
      <PaymentReceipt
        payments={existingPayments}
        totalAmount={totalAmount}
        // Payments are only ever inserted — there is no action that edits or
        // voids one — so correcting an entry means recording another against
        // the same assessment, which the receipt then shows alongside it.
        onRecordAnother={
          canRecordNow && adminEdit ? () => setRecordingAnother(true) : undefined
        }
      />
    )
  }

  if (!canRecordNow) {
    return null
  }

  return (
    <PaymentFormInner
      applicationId={applicationId}
      assessmentId={assessmentId}
      totalAmount={totalAmount}
      onCancel={
        existingPayments.length > 0
          ? () => setRecordingAnother(false)
          : undefined
      }
      onSaved={() => setRecordingAnother(false)}
    />
  )
}

function PaymentFormInner({
  applicationId,
  assessmentId,
  totalAmount,
  onCancel,
  onSaved,
}: {
  applicationId: string
  assessmentId: string
  totalAmount: number
  onCancel?: () => void
  onSaved?: () => void
}) {
  const router = useRouter()
  const { profile } = useProfile()
  const [serverError, setServerError] = useState<string | null>(null)

  const today = new Date().toISOString().split("T")[0]

  // Fields hold raw input; the resolver hands onSubmit the coerced values.
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormInput, unknown, PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      or_number: "",
      amount_paid: totalAmount,
      payment_date: today,
      payment_method: "cash",
    },
  })

  async function onSubmit(data: PaymentFormValues) {
    setServerError(null)

    const result = await recordPayment(applicationId, assessmentId, data)
    if (result.error) {
      setServerError(result.error)
      return
    }

    router.refresh()
    onSaved?.()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Banknote className="h-4 w-4" />
          Record Payment
        </CardTitle>
        <CardDescription>
          Amount due: ₱
          {totalAmount.toLocaleString("en-PH", {
            minimumFractionDigits: 2,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {serverError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="or_number">OR Number</Label>
              <Input
                id="or_number"
                placeholder="Official Receipt #"
                {...register("or_number")}
                aria-invalid={!!errors.or_number}
              />
              {errors.or_number && (
                <p className="text-xs text-destructive">
                  {errors.or_number.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount_paid">Amount Paid</Label>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground">₱</span>
                <Input
                  id="amount_paid"
                  type="number"
                  step="0.01"
                  {...register("amount_paid")}
                  aria-invalid={!!errors.amount_paid}
                />
              </div>
              {errors.amount_paid && (
                <p className="text-xs text-destructive">
                  {errors.amount_paid.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_date">Payment Date</Label>
              <Input
                id="payment_date"
                type="date"
                {...register("payment_date")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_method">Payment Method</Label>
              <select
                id="payment_method"
                {...register("payment_method")}
                className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="cash">Cash</option>
                <option value="check">Check</option>
              </select>
            </div>
          </div>

          {/* Received by — auto-filled */}
          <p className="text-sm text-muted-foreground">
            Received by:{" "}
            <strong className="text-foreground">
              {profile?.full_name ?? "—"}
            </strong>
          </p>

          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Record Payment &amp; Forward to Approval
            </Button>
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function PaymentReceipt({
  payments,
  totalAmount,
  onRecordAnother,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payments: any[]
  totalAmount: number
  onRecordAnother?: () => void
}) {
  const totalPaid = payments.reduce(
    (sum: number, p: { amount_paid: number }) => sum + Number(p.amount_paid),
    0
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Banknote className="h-4 w-4" />
          Payment
        </CardTitle>
        <CardDescription>
          ₱{totalPaid.toLocaleString("en-PH", { minimumFractionDigits: 2 })}{" "}
          of ₱
          {totalAmount.toLocaleString("en-PH", {
            minimumFractionDigits: 2,
          })}{" "}
          paid
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {payments.map(
          (p: {
            id: string
            or_number: string
            amount_paid: number
            payment_date: string
            payment_method: string
            receiver?: { full_name: string } | null
          }) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm"
            >
              <div>
                <p className="font-mono font-medium">OR #{p.or_number}</p>
                <p className="text-xs text-muted-foreground">
                  {p.payment_date} &middot;{" "}
                  {p.payment_method === "cash" ? "Cash" : "Check"} &middot;{" "}
                  {p.receiver?.full_name ?? "—"}
                </p>
              </div>
              <span className="font-medium">
                ₱
                {Number(p.amount_paid).toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
          )
        )}

        {onRecordAnother && (
          <Button variant="outline" size="sm" onClick={onRecordAnother}>
            <Banknote className="mr-2 h-4 w-4" />
            Record another payment
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
