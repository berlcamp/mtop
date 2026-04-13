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
