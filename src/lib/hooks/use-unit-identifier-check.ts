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
 * Warns while the clerk is still typing that a body, plate, motor or chassis
 * number is already on another active franchise, one message per field.
 *
 * Advisory only: the same check runs again in the create actions, and the
 * database is what actually enforces it. `excludeFranchiseId` skips the
 * franchise being edited, so an unchanged number doesn't flag itself.
 *
 * `labels` overrides a field's name in the message, for the staged numbers on
 * a change of unit where "Plate number" would read as the current one.
 */
export function useUnitIdentifierCheck({
  bodyNumber,
  plateNumber,
  motorNumber = "",
  chassisNumber = "",
  excludeFranchiseId,
  labels,
}: {
  bodyNumber: string
  plateNumber: string
  motorNumber?: string
  chassisNumber?: string
  excludeFranchiseId?: string
  labels?: Partial<Record<UnitIdentifierField, string>>
}): UnitIdentifierMessages {
  const [messages, setMessages] = useState<UnitIdentifierMessages>({})

  // The label map is rebuilt on every render by any caller writing it inline,
  // which would restart the debounce on every keystroke. Compare by value.
  const labelKey = JSON.stringify(labels ?? {})

  useEffect(() => {
    let cancelled = false

    // Everything happens inside the timer, including clearing a stale
    // warning — setting state in the effect body itself would cascade a
    // render on every keystroke.
    const timer = setTimeout(async () => {
      const numbers = {
        bodyNumber: bodyNumber.trim(),
        plateNumber: plateNumber.trim(),
        motorNumber: motorNumber.trim(),
        chassisNumber: chassisNumber.trim(),
      }

      if (
        !Object.values(numbers).some((value) => normalizeUnitIdentifier(value))
      ) {
        if (!cancelled) setMessages({})
        return
      }

      const result = await checkUnitIdentifiers(numbers, excludeFranchiseId)
      if (cancelled || result.error) return

      const resolved: Partial<Record<UnitIdentifierField, string>> =
        JSON.parse(labelKey)

      const next: UnitIdentifierMessages = {}
      for (const conflict of result.conflicts) {
        next[conflict.field] = unitConflictMessage(
          conflict,
          resolved[conflict.field]
        )
      }
      setMessages(next)
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [
    bodyNumber,
    plateNumber,
    motorNumber,
    chassisNumber,
    excludeFranchiseId,
    labelKey,
  ])

  return messages
}
