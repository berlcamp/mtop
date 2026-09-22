import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns"

import { officeDateParts } from "@/lib/office-time"

export type PermitExpirationStatus = "active" | "due_for_renewal" | "expired"

export interface PermitExpirationInfo {
  status: PermitExpirationStatus
  expirationDate: Date
  daysRemaining: number
}

/**
 * Midnight of today's date in Ozamiz, as a local Date.
 *
 * `granted_until` is a DATE — a calendar day with no time to it — so whether a
 * permit has expired is a question about days, not instants. Reckoning it in
 * office time keeps a clerk whose laptop is set to another zone from seeing a
 * different answer than the counter beside them.
 */
function officeStartOfToday(): Date {
  const parts = officeDateParts(new Date().toISOString())
  if (!parts) return new Date()
  return new Date(parts.year, parts.month - 1, parts.day)
}

function asLocalDay(grantedUntil: string | Date): Date {
  if (typeof grantedUntil === "string") return parseISO(grantedUntil)
  return new Date(
    grantedUntil.getFullYear(),
    grantedUntil.getMonth(),
    grantedUntil.getDate()
  )
}

// Derives expiration status from a franchise's stored granted_until date.
export function getExpirationStatus(
  grantedUntil: string | Date,
  renewalWindowDays: number
): PermitExpirationInfo {
  const expirationDate = asLocalDay(grantedUntil)
  const daysRemaining = differenceInCalendarDays(
    expirationDate,
    officeStartOfToday()
  )

  let status: PermitExpirationStatus
  if (daysRemaining < 0) {
    status = "expired"
  } else if (daysRemaining <= renewalWindowDays) {
    status = "due_for_renewal"
  } else {
    status = "active"
  }

  return { status, expirationDate, daysRemaining }
}

/**
 * The same three statuses expressed as bounds on the `granted_until` column,
 * so a list can be filtered in the database instead of after paging.
 *
 * `expired` is everything before `today`, `due_for_renewal` is `today` through
 * `windowEnd` inclusive, `active` is everything after — the boundaries
 * getExpirationStatus() uses above, and the ones getRenewalStats() counts by,
 * so a dashboard card and the list it links to report the same number.
 */
export function expirationDateBounds(renewalWindowDays: number): {
  today: string
  windowEnd: string
} {
  const today = officeStartOfToday()
  return {
    today: format(today, "yyyy-MM-dd"),
    windowEnd: format(addDays(today, renewalWindowDays), "yyyy-MM-dd"),
  }
}
