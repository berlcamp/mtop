"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { format, formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  auditGroupLabels,
  historyEventColors,
  type AuditFieldGroup,
  type FranchiseHistoryEvent,
} from "@/lib/audit"

const filters: { key: AuditFieldGroup | "all"; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "operator", label: auditGroupLabels.operator },
  { key: "driver", label: auditGroupLabels.driver },
  { key: "unit", label: auditGroupLabels.unit },
]

/**
 * A franchise's audit trail. Every entry names who did it and when; entries
 * that changed fields also show the value on both sides, because "updated the
 * driver" is not an audit record — "JUAN CRUZ → PEDRO SANTOS" is.
 */
export function HistoryTimeline({
  events,
  showFilters = true,
  emptyMessage = "No recorded history yet.",
}: {
  events: FranchiseHistoryEvent[]
  showFilters?: boolean
  emptyMessage?: string
}) {
  const [filter, setFilter] = useState<AuditFieldGroup | "all">("all")

  const visible = useMemo(
    () =>
      filter === "all"
        ? events
        : events.filter((e) => e.groups.includes(filter)),
    [events, filter]
  )

  return (
    <div className="space-y-4">
      {showFilters && (
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <Button
              key={f.key}
              type="button"
              size="sm"
              variant={filter === f.key ? "secondary" : "ghost"}
              className="h-7 px-2.5 text-xs"
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {filter === "all"
            ? emptyMessage
            : `No ${auditGroupLabels[filter].toLowerCase()} changes recorded.`}
        </p>
      ) : (
        <div className="space-y-4">
          {visible.map((event, index) => (
            <div key={event.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "h-2.5 w-2.5 rounded-full mt-1.5 shrink-0",
                    historyEventColors[event.kind]
                  )}
                />
                {index < visible.length - 1 && (
                  <div className="w-px flex-1 bg-border mt-1" />
                )}
              </div>

              <div className="pb-4 min-w-0 flex-1 space-y-1.5">
                <p className="text-sm">
                  <span className="font-medium">{event.title}</span>
                  {event.subtitle && (
                    <span className="text-muted-foreground">
                      {" "}
                      — {event.subtitle}
                    </span>
                  )}
                </p>

                {event.changes.length > 0 && (
                  <ul className="space-y-0.5 text-xs">
                    {event.changes.map((change) => (
                      <li key={change.column} className="text-muted-foreground">
                        <span className="text-foreground">{change.label}:</span>{" "}
                        <span className="line-through">{change.from}</span>
                        <span aria-hidden> → </span>
                        <span className="sr-only">changed to</span>
                        <span className="text-foreground font-medium">
                          {change.to}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {event.remarks && (
                  <p className="text-xs text-muted-foreground italic">
                    &ldquo;{event.remarks}&rdquo;
                  </p>
                )}

                <p className="text-xs text-muted-foreground">
                  {/* A service-role or Studio write has no JWT, so there is
                      genuinely no user to name — say so rather than guess. */}
                  {event.actor ?? "System"}
                  {" · "}
                  <time
                    dateTime={event.at}
                    title={format(new Date(event.at), "MMM d, yyyy h:mm a")}
                  >
                    {formatDistanceToNow(new Date(event.at), {
                      addSuffix: true,
                    })}
                  </time>
                  {event.applicationId && (
                    <>
                      {" · "}
                      <Link
                        href={`/dashboard/applications/${event.applicationId}`}
                        className="underline underline-offset-2 hover:text-foreground"
                      >
                        View transaction
                      </Link>
                    </>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
