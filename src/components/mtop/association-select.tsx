"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { getAssociations } from "@/lib/actions/associations"
import type { Association } from "@/types/database"

/**
 * Association picker for the franchise forms.
 *
 * A native <select> rather than a styled listbox: there are ~70 associations,
 * and a native control gives keyboard type-ahead, mobile's own picker, and
 * clean react-hook-form registration for free. `register("association_id")`
 * is spread onto it by the caller.
 */
export function AssociationSelect({
  id,
  className,
  invalid,
  /** The currently-saved association, so a deactivated one still shows up. */
  currentAssociation,
  ...props
}: React.ComponentProps<"select"> & {
  invalid?: boolean
  currentAssociation?: { id: string; name: string } | null
}) {
  const [associations, setAssociations] = useState<Association[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getAssociations().then((result) => {
      if (cancelled) return
      if (result.error) setError(result.error)
      else setAssociations(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const options = associations ?? []
  // A franchise registered under an association that has since been
  // deactivated must still render its own value, or saving the form would
  // silently reassign it.
  const needsCurrent =
    currentAssociation &&
    options.every((a) => a.id !== currentAssociation.id)

  return (
    <div className="space-y-1">
      <select
        id={id}
        aria-invalid={invalid}
        className={cn(
          "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30",
          className
        )}
        {...props}
      >
        <option value="">
          {associations === null ? "Loading associations…" : "Select an association…"}
        </option>
        {needsCurrent && (
          <option value={currentAssociation.id}>
            {currentAssociation.name} (inactive)
          </option>
        )}
        {options.map((association) => (
          <option key={association.id} value={association.id}>
            {association.name}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
