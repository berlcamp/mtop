import { differenceInDays, isPast } from "date-fns"

export type PermitExpirationStatus = "active" | "due_for_renewal" | "expired"

export interface PermitExpirationInfo {
  status: PermitExpirationStatus
  expirationDate: Date
  daysRemaining: number
}

// Derives expiration status from a franchise's stored granted_until date.
export function getExpirationStatus(
  grantedUntil: string | Date,
  renewalWindowDays: number
): PermitExpirationInfo {
  const expirationDate = new Date(grantedUntil)
  const daysRemaining = differenceInDays(expirationDate, new Date())

  let status: PermitExpirationStatus
  if (isPast(expirationDate)) {
    status = "expired"
  } else if (daysRemaining <= renewalWindowDays) {
    status = "due_for_renewal"
  } else {
    status = "active"
  }

  return { status, expirationDate, daysRemaining }
}
