"use client"

import { useEffect, useState } from "react"
import { checkUnitIdentifiers } from "@/lib/actions/applications"
import {
  normalizeUnitIdentifier,
  unitConflictMessage,
  type UnitIdentifierField,
} from "@/lib/unit-identifier"

export type UnitIdentifierMessages = Partial<
  Record<UnitIdentifierField, string>
>

/**
 * Warns while the clerk is still typing that a body or plate number is already
 * on another active franchise, one message per field.
 *
 * Advisory only: the same check runs again in the create actions, and the
 * database is what actually enforces it. `excludeFranchiseId` skips the
 * franchise being edited, so an unchanged number doesn't flag itself.
 */
export function useUnitIdentifierCheck({
  bodyNumber,
  plateNumber,
  excludeFranchiseId,
  plateLabel,
}: {
  bodyNumber: string
  plateNumber: string
  excludeFranchiseId?: string
  plateLabel?: string
}): UnitIdentifierMessages {
  const [messages, setMessages] = useState<UnitIdentifierMessages>({})

  useEffect(() => {
    let cancelled = false

    // Everything happens inside the timer, including clearing a stale
    // warning — setting state in the effect body itself would cascade a
    // render on every keystroke.
    const timer = setTimeout(async () => {
      const body = bodyNumber.trim()
      const plate = plateNumber.trim()

      if (!normalizeUnitIdentifier(body) && !normalizeUnitIdentifier(plate)) {
        if (!cancelled) setMessages({})
        return
      }

      const result = await checkUnitIdentifiers(
        { bodyNumber: body, plateNumber: plate },
        excludeFranchiseId
      )
      if (cancelled || result.error) return

      const next: UnitIdentifierMessages = {}
      for (const conflict of result.conflicts) {
        next[conflict.field] = unitConflictMessage(
          conflict,
          conflict.field === "plate_number" ? plateLabel : undefined
        )
      }
      setMessages(next)
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [bodyNumber, plateNumber, excludeFranchiseId, plateLabel])

  return messages
}
