import { differenceInDays, addYears, isPast } from "date-fns"

export type PermitExpirationStatus = "active" | "due_for_renewal" | "expired"

export interface PermitExpirationInfo {
  status: PermitExpirationStatus
  expirationDate: Date
  daysRemaining: number
}

export function getPermitExpirationInfo(
  grantedAt: string | Date,
  validityYears: number,
  renewalWindowDays: number
): PermitExpirationInfo {
  const granted = new Date(grantedAt)
  const expirationDate = addYears(granted, validityYears)
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
