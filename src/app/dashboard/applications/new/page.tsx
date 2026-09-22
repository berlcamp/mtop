"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertCircle } from "lucide-react"
import { getTransactionTypes } from "@/lib/actions/transaction-types"
import type { TransactionType } from "@/types/database"
import { TransactionPicker } from "./transaction-picker"
import { FranchiseLookup, type FranchiseSearchHit } from "./franchise-lookup"
import { FranchiseTransactionForm } from "./franchise-transaction-form"
import { NewFranchiseForm } from "./new-franchise-form"

// The flow is deliberately "what are you doing?" → "which franchise?" → "file
// it". Picking the transaction first is what lets every later screen name the
// transaction and show its exact checklist.
type Step =
  | { kind: "pick" }
  | { kind: "lookup"; type: TransactionType }
  | { kind: "file"; type: TransactionType; franchise: FranchiseSearchHit }
  | { kind: "new"; type: TransactionType }

export default function NewApplicationPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>({ kind: "pick" })
  const [types, setTypes] = useState<TransactionType[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getTransactionTypes().then((result) => {
      if (result.error) setError(result.error)
      else setTypes(result.data)
    })
  }, [])

  function handlePick(type: TransactionType) {
    setStep(
      type.requires_existing_franchise
        ? { kind: "lookup", type }
        : { kind: "new", type }
    )
  }

  const subtitle =
    step.kind === "pick"
      ? "Choose the transaction you are filing"
      : step.kind === "lookup"
        ? `${step.type.name} — find the franchise`
        : step.kind === "file"
          ? `${step.type.name} — ${step.franchise.mtop_number ?? "franchise"}`
          : `${step.type.name} — register the operator and unit`

  return (
    <div className="space-y-6">
      <PageHeader title="New Application" subtitle={subtitle} />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {step.kind === "pick" &&
        (types === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading
            transactions…
          </p>
        ) : (
          <TransactionPicker types={types} onPick={handlePick} />
        ))}

      {step.kind === "lookup" && (
        <FranchiseLookup
          transactionType={step.type}
          onBack={() => setStep({ kind: "pick" })}
          onSelectFranchise={(franchise) =>
            setStep({ kind: "file", type: step.type, franchise })
          }
        />
      )}

      {step.kind === "file" && (
        <FranchiseTransactionForm
          transactionType={step.type}
          franchise={step.franchise}
          onBack={() => setStep({ kind: "lookup", type: step.type })}
          onSubmitted={(applicationId) =>
            router.push(`/dashboard/applications/${applicationId}`)
          }
        />
      )}

      {step.kind === "new" && (
        <NewFranchiseForm
          transactionType={step.type}
          onBack={() => setStep({ kind: "pick" })}
          onSubmitted={(applicationId) =>
            router.push(`/dashboard/applications/${applicationId}`)
          }
        />
      )}
    </div>
  )
}
