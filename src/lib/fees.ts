import { differenceInDays } from "date-fns"

export const STANDARD_FEES = {
  filing_fee: 400.0,
  supervision_fee: 180.0,
  confirmation_fee: 65.0,
  mayors_permit_fee: 300.0,
  franchise_fee: 400.0,
  police_clearance_fee: 50.0,
  health_fee: 50.0,
  legal_research_fee: 65.0,
  parking_fee: 900.0,
} as const

/**
 * A closure is priced on its own terms: none of the annual fees apply, because
 * nothing is being granted for a year. These two are the whole bill.
 */
export const CLOSURE_FEES = {
  certification_fee: 100.0,
  closure_fee: 500.0,
} as const

export const FEE_LABELS: Record<string, string> = {
  filing_fee: "Filing Fee (annual)",
  supervision_fee: "Supervision Fee (annual)",
  confirmation_fee: "Confirmation Fee (annual)",
  mayors_permit_fee: "Mayor's Permit Fee (annual)",
  franchise_fee: "Franchise (annual)",
  police_clearance_fee: "Police Clearance (annual)",
  health_fee: "Health Fee (annual)",
  legal_research_fee: "Legal Research Fee (annual)",
  parking_fee: "Parking Fee (₱75.00/month × 12)",
  late_renewal_penalty: "Late Renewal Penalty",
  change_of_motor_fee: "Change of Motor (Power Train)",
  replacement_plate_fee: "Replacement of Loss Plate",
  certification_fee: "Certification Fee",
  closure_fee: "Payment for Closure of Franchise",
}

/** Every column on mtop_assessments that holds money, in display order. */
export const ALL_FEE_KEYS = [
  ...Object.keys(STANDARD_FEES),
  "late_renewal_penalty",
  "change_of_motor_fee",
  "replacement_plate_fee",
  ...Object.keys(CLOSURE_FEES),
] as const

const CLOSURE_FEE_KEYS = Object.keys(CLOSURE_FEES)

/**
 * Which fees a transaction may be charged, and what they start at.
 *
 * Closure gets its two and nothing else; everything else gets the annual
 * schedule and the situational extras, and never the closure fees. The server
 * action applies this too, so a client cannot price a closure as a renewal.
 */
export function feeScheduleFor(
  transactionCode: string | null | undefined,
  latePenalty = 0
): Record<string, number> {
  if (transactionCode === "closure") return { ...CLOSURE_FEES }

  return {
    ...STANDARD_FEES,
    late_renewal_penalty: latePenalty,
    change_of_motor_fee: 0,
    replacement_plate_fee: 0,
  }
}

/** The keys of feeScheduleFor(), without needing a penalty figure to hand. */
export function feeKeysFor(transactionCode: string | null | undefined): string[] {
  return transactionCode === "closure"
    ? [...CLOSURE_FEE_KEYS]
    : ALL_FEE_KEYS.filter((key) => !CLOSURE_FEE_KEYS.includes(key))
}

export function calculateLatePenalty(
  dueDate: Date,
  renewalDate: Date
): number {
  const daysLate = differenceInDays(renewalDate, dueDate)
  if (daysLate <= 0) return 0
  if (daysLate <= 30) return 50.0
  const additionalMonths = Math.ceil((daysLate - 30) / 30)
  return 50.0 + additionalMonths * 75.0
}
