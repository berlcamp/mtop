import { z } from "zod"

// Franchise (stable owner + tricycle identity).
// Used both standalone and as the base for new-franchise application input.
export const franchiseSchema = z.object({
  applicant_name: z.string().min(2, "Applicant name must be at least 2 characters"),
  applicant_address: z.string().min(5, "Address must be at least 5 characters"),
  contact_number: z.string().min(7, "Contact number must be at least 7 characters"),
  tricycle_body_number: z.string().min(1, "Body number is required"),
  plate_number: z.string().min(1, "Plate number is required"),
  motor_number: z.string().min(1, "Motor number is required"),
  chassis_number: z.string().min(1, "Chassis number is required"),
  route: z.string().min(1, "Route is required"),
  // Printed on the Franchise Card; optional so existing franchises stay valid.
  make: z.string().trim().max(60).optional(),
  day_off: z.string().trim().max(60).optional(),
})

export type FranchiseFormValues = z.infer<typeof franchiseSchema>

// First-time application — creates a new franchise + first application together.
// This is the only transaction that does not start from an existing franchise.
export const newFranchiseApplicationSchema = franchiseSchema.extend({
  due_date: z.string().optional(),
})

export type NewFranchiseApplicationFormValues = z.infer<
  typeof newFranchiseApplicationSchema
>

// Transactions filed against a franchise that already exists. One schema for
// all six of them; which one is being filed is `transaction_type_code`, and the
// server action applies the rules specific to that transaction.
export const existingFranchiseTransactionCodes = [
  "renewal",
  "annual_confirmation",
  "change_unit",
  "change_ownership",
  "reissuance",
  "closure",
] as const

export const franchiseTransactionSchema = z.object({
  franchise_id: z.string().uuid(),
  transaction_type_code: z.enum(existingFranchiseTransactionCodes),
  applicant_address: z
    .string()
    .min(5, "Address must be at least 5 characters")
    .optional(),
  contact_number: z
    .string()
    .min(7, "Contact number must be at least 7 characters")
    .optional(),
  tricycle_body_number: z.string().min(1).optional(),
  plate_number: z.string().min(1).optional(),
  route: z.string().min(1).optional(),
  make: z.string().trim().max(60).optional(),
  day_off: z.string().trim().max(60).optional(),
  due_date: z.string().optional(),
})

export type FranchiseTransactionFormValues = z.infer<
  typeof franchiseTransactionSchema
>

// Inspection schema
export const inspectionSchema = z.object({
  clean_windshields: z.boolean(),
  garbage_receptacle: z.boolean(),
  functioning_horn: z.boolean(),
  signal_lights: z.boolean(),
  tail_light: z.boolean(),
  top_chain: z.boolean(),
  headlights_taillights: z.boolean(),
  sidecar_light: z.boolean(),
  anti_noise_equipment: z.boolean(),
  body_number_sticker: z.boolean(),
  functional_mufflers: z.boolean(),
  road_worthiness: z.boolean(),
  remarks: z.string().optional(),
})

export type InspectionFormValues = z.infer<typeof inspectionSchema>

// Assessment schema
export const assessmentSchema = z.object({
  filing_fee: z.coerce.number().min(0),
  supervision_fee: z.coerce.number().min(0),
  confirmation_fee: z.coerce.number().min(0),
  mayors_permit_fee: z.coerce.number().min(0),
  franchise_fee: z.coerce.number().min(0),
  police_clearance_fee: z.coerce.number().min(0),
  health_fee: z.coerce.number().min(0),
  legal_research_fee: z.coerce.number().min(0),
  parking_fee: z.coerce.number().min(0),
  late_renewal_penalty: z.coerce.number().min(0),
  change_of_motor_fee: z.coerce.number().min(0),
  replacement_plate_fee: z.coerce.number().min(0),
})

export type AssessmentFormValues = z.infer<typeof assessmentSchema>

// Payment schema
export const paymentSchema = z.object({
  or_number: z.string().min(1, "OR number is required"),
  // Coerced because <input type="number"> hands react-hook-form a string.
  amount_paid: z.coerce.number().positive("Amount must be greater than 0"),
  payment_date: z.string().optional(),
  payment_method: z.enum(["cash", "check"]),
})

// Input = what the form fields hold pre-coercion; Values = what the action gets.
export type PaymentFormInput = z.input<typeof paymentSchema>
export type PaymentFormValues = z.infer<typeof paymentSchema>

// Status transition remarks
export const statusActionSchema = z.object({
  remarks: z.string().optional(),
})

export const returnActionSchema = z.object({
  remarks: z.string().min(1, "Remarks are required when returning an application"),
})

// System settings schema
export const systemSettingsSchema = z.object({
  permit_validity_years: z.coerce.number().int().min(1).max(10),
  renewal_window_days: z.coerce.number().int().min(1).max(365),
  // Free-form: local numbers are written many ways ((088) 521-1234, 0917-…).
  ctms_contact_number: z
    .string()
    .trim()
    .max(50, "Contact number is too long")
    .default(""),
})

export type SystemSettingsFormValues = z.infer<typeof systemSettingsSchema>
