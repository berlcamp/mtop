"use client"

import { useEffect, useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, ClipboardList } from "lucide-react"
import {
  getTransactionRequirements,
  type RequirementPreview,
} from "@/lib/actions/transaction-types"
import { REQUIREMENT_KINDS, groupByKind, isBlocking } from "@/lib/requirements"

/**
 * Shows the exact checklist this transaction will ask for, before the operator
 * commits to filing it. The city's counter staff work from a paper checklist
 * per transaction; this is that same sheet, so they can tell the applicant what
 * to bring without opening the application first.
 */
export function RequirementsPreview({
  transactionTypeId,
  transactionName,
}: {
  transactionTypeId: string
  transactionName: string
}) {
  const [items, setItems] = useState<RequirementPreview[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // The call site keys this component on transactionTypeId, so a different
  // transaction remounts it rather than resetting state inside the effect.
  useEffect(() => {
    let cancelled = false

    getTransactionRequirements(transactionTypeId).then((result) => {
      if (cancelled) return
      if (result.error) setError(result.error)
      else setItems(result.data)
    })

    return () => {
      cancelled = true
    }
  }, [transactionTypeId])

  const required = items?.filter(isBlocking).length ?? 0
  const conditional = (items?.length ?? 0) - required

  return (
    <Card className="lg:sticky lg:top-6">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          What to collect
        </CardTitle>
        <CardDescription>
          {items === null
            ? transactionName
            : `${transactionName} — ${required} required item${required === 1 ? "" : "s"}${
                conditional > 0 ? `, ${conditional} if applicable` : ""
              }`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && <p className="text-xs text-destructive">{error}</p>}

        {items === null && !error && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading checklist…
          </p>
        )}

        {items && items.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No checklist is configured for this transaction yet.
          </p>
        )}

        {items && items.length > 0 && (
          <div className="space-y-4">
            {groupByKind(items).map((group) => (
              <div key={group.kind} className="space-y-1.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {REQUIREMENT_KINDS[group.kind].label}
                </h3>
                <ul className="space-y-1.5">
                  {group.items.map((item) => (
                    <li key={item.code} className="flex items-start gap-2">
                      <span
                        aria-hidden
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50"
                      />
                      <span className="text-sm leading-snug">
                        {item.label}
                        {item.is_conditional && (
                          <Badge
                            variant="outline"
                            className="ml-1.5 align-middle text-[10px] font-normal"
                          >
                            if applicable
                          </Badge>
                        )}
                        {(item.note || item.description) && (
                          <span className="block text-xs text-muted-foreground">
                            {item.note || item.description}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
