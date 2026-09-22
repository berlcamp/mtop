"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  FilePlus2,
  RefreshCw,
  CalendarCheck,
  Bike,
  UserRoundCog,
  Copy,
  Archive,
  ChevronRight,
  ClipboardCheck,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { TransactionType, TransactionTypeCode } from "@/types/database"

// Icons are presentation, so they live here rather than in the database.
const ICONS: Record<TransactionTypeCode, LucideIcon> = {
  new_franchise: FilePlus2,
  renewal: RefreshCw,
  annual_confirmation: CalendarCheck,
  change_unit: Bike,
  change_ownership: UserRoundCog,
  reissuance: Copy,
  closure: Archive,
}

export function TransactionPicker({
  types,
  onPick,
}: {
  types: TransactionType[]
  onPick: (type: TransactionType) => void
}) {
  // Splitting the list this way answers the operator's first question — "do I
  // need to look up an existing franchise, or is this a brand-new one?" —
  // before they read any of the names.
  const newFranchise = types.filter((t) => !t.requires_existing_franchise)
  const existing = types.filter((t) => t.requires_existing_franchise)

  return (
    <div className="space-y-8">
      <Section
        title="For a franchise that already exists"
        description="You will look up the franchise by MTOP number or owner name in the next step."
        types={existing}
        onPick={onPick}
      />
      <Section
        title="For a brand-new franchise"
        description="No MTOP number yet — this registers the operator and the unit for the first time."
        types={newFranchise}
        onPick={onPick}
      />
    </div>
  )
}

function Section({
  title,
  description,
  types,
  onPick,
}: {
  title: string
  description: string
  types: TransactionType[]
  onPick: (type: TransactionType) => void
}) {
  if (types.length === 0) return null

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {types.map((type) => (
          <TransactionCard key={type.id} type={type} onPick={onPick} />
        ))}
      </div>
    </section>
  )
}

function TransactionCard({
  type,
  onPick,
}: {
  type: TransactionType
  onPick: (type: TransactionType) => void
}) {
  const Icon = ICONS[type.code] ?? FilePlus2

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onPick(type)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onPick(type)
        }
      }}
      className="group cursor-pointer transition-colors hover:border-primary/60 hover:bg-accent/40 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold leading-snug">{type.name}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {type.description}
            </p>
          </div>
          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>

        {type.when_to_use && (
          <p className="rounded-md bg-muted/60 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
            {type.when_to_use}
          </p>
        )}

        {type.requires_inspection && (
          <Badge variant="secondary" className="gap-1 text-xs font-normal">
            <ClipboardCheck className="h-3 w-3" />
            Needs physical inspection
          </Badge>
        )}
      </CardContent>
    </Card>
  )
}
