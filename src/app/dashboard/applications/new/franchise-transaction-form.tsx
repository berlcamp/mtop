"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertCircle, ArrowLeft } from "lucide-react"
import {
  franchiseTransactionSchema,
  type FranchiseTransactionFormValues,
  existingFranchiseTransactionCodes,
} from "@/lib/schemas/mtop"
import { createFranchiseTransaction } from "@/lib/actions/applications"
import type { TransactionType } from "@/types/database"
import type { FranchiseSearchHit } from "./franchise-lookup"
import { RequirementsPreview } from "./requirements-preview"
import { ReadOnlyField } from "./read-only-field"

type ExistingCode = (typeof existingFranchiseTransactionCodes)[number]

export function FranchiseTransactionForm({
  transactionType,
  franchise,
  onBack,
  onSubmitted,
}: {
  transactionType: TransactionType
  franchise: FranchiseSearchHit
  onBack: () => void
  onSubmitted: (applicationId: string) => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FranchiseTransactionFormValues>({
    resolver: zodResolver(franchiseTransactionSchema),
    defaultValues: {
      franchise_id: franchise.id,
      transaction_type_code: transactionType.code as ExistingCode,
      applicant_address: franchise.applicant_address ?? "",
      contact_number: franchise.contact_number ?? "",
      tricycle_body_number: franchise.tricycle_body_number ?? "",
      plate_number: franchise.plate_number ?? "",
      route: franchise.route ?? "",
      make: franchise.make ?? "",
      day_off: franchise.day_off ?? "",
      due_date: "",
    },
  })

  async function onSubmit(data: FranchiseTransactionFormValues) {
    setServerError(null)
    const result = await createFranchiseTransaction(data)
    if (result.error || !result.data) {
      setServerError(result.error ?? "Failed to file this transaction")
      return
    }
    onSubmitted(result.data.id)
  }

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="gap-1.5 -ml-2"
      >
        <ArrowLeft className="h-4 w-4" /> Back to franchise search
      </Button>

      <div className="grid gap-6 lg:grid-cols-3">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-6 lg:col-span-2"
        >
          <input type="hidden" {...register("franchise_id")} />
          <input type="hidden" {...register("transaction_type_code")} />

          {serverError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Franchise Identity (locked)
              </CardTitle>
              <CardDescription>
                These fields identify the franchise and do not change when
                filing {transactionType.name.toLowerCase()}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2 text-sm">
                <ReadOnlyField
                  label="MTOP Number"
                  value={franchise.mtop_number}
                  mono
                />
                <ReadOnlyField label="Owner" value={franchise.applicant_name} />
                <ReadOnlyField
                  label="Motor Number"
                  value={franchise.motor_number}
                  mono
                />
                <ReadOnlyField
                  label="Chassis Number"
                  value={franchise.chassis_number}
                  mono
                />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Details on File</CardTitle>
              <CardDescription>
                Correct anything that has changed since the last transaction.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="applicant_address">Address</Label>
                <Input
                  id="applicant_address"
                  {...register("applicant_address")}
                  aria-invalid={!!errors.applicant_address}
                />
                {errors.applicant_address && (
                  <p className="text-xs text-destructive">
                    {errors.applicant_address.message}
                  </p>
                )}
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="contact_number">Contact Number</Label>
                  <Input
                    id="contact_number"
                    {...register("contact_number")}
                    aria-invalid={!!errors.contact_number}
                  />
                  {errors.contact_number && (
                    <p className="text-xs text-destructive">
                      {errors.contact_number.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="plate_number">Plate Number</Label>
                  <Input id="plate_number" {...register("plate_number")} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tricycle_body_number">Body Number</Label>
                  <Input
                    id="tricycle_body_number"
                    {...register("tricycle_body_number")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="route">Route</Label>
                  <Input id="route" {...register("route")} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="make">Make</Label>
                  <Input id="make" {...register("make")} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="day_off">Day Off</Label>
                  <Input id="day_off" {...register("day_off")} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="due_date">Due Date (optional)</Label>
                <Input id="due_date" type="date" {...register("due_date")} />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onBack}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              File {transactionType.name}
            </Button>
          </div>
        </form>

        <div>
          <RequirementsPreview
            key={transactionType.id}
            transactionTypeId={transactionType.id}
            transactionName={transactionType.name}
          />
        </div>
      </div>
    </div>
  )
}
