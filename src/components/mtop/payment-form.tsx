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
import { paymentSchema, type PaymentFormValues } from "@/lib/schemas/mtop"
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
}

export function PaymentForm({
  applicationId,
  assessmentId,
  totalAmount,
  isAssessmentApproved,
  existingPayments,
  canRecord,
  status,
}: PaymentFormProps) {
  // Show existing payments if any
  if (existingPayments.length > 0) {
    return (
      <PaymentReceipt
        payments={existingPayments}
        totalAmount={totalAmount}
      />
    )
  }

  // Only show form if assessment is approved and user can record
  if (
    status !== "for_assessment" ||
    !isAssessmentApproved ||
    !canRecord
  ) {
    return null
  }

  return (
    <PaymentFormInner
      applicationId={applicationId}
      assessmentId={assessmentId}
      totalAmount={totalAmount}
    />
  )
}

function PaymentFormInner({
  applicationId,
  assessmentId,
  totalAmount,
}: {
  applicationId: string
  assessmentId: string
  totalAmount: number
}) {
  const router = useRouter()
  const { profile } = useProfile()
  const [serverError, setServerError] = useState<string | null>(null)

  const today = new Date().toISOString().split("T")[0]

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormValues>({
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

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Record Payment &amp; Forward to Approval
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function PaymentReceipt({
  payments,
  totalAmount,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payments: any[]
  totalAmount: number
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
      </CardContent>
    </Card>
  )
}
