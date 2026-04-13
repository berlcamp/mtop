import { z } from "zod"

// New application schema
export const applicationSchema = z.object({
  applicant_name: z.string().min(2, "Applicant name must be at least 2 characters"),
  applicant_address: z.string().min(5, "Address must be at least 5 characters"),
  contact_number: z.string().min(7, "Contact number must be at least 7 characters"),
  tricycle_body_number: z.string().min(1, "Body number is required"),
  plate_number: z.string().min(1, "Plate number is required"),
  motor_number: z.string().min(1, "Motor number is required"),
  chassis_number: z.string().min(1, "Chassis number is required"),
  route: z.string().min(1, "Route is required"),
  due_date: z.string().optional(),
})

export type ApplicationFormValues = z.infer<typeof applicationSchema>

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
  amount_paid: z.number().positive("Amount must be greater than 0"),
  payment_date: z.string().optional(),
  payment_method: z.enum(["cash", "check"]),
})

export type PaymentFormValues = z.infer<typeof paymentSchema>

// Status transition remarks
export const statusActionSchema = z.object({
  remarks: z.string().optional(),
})

export const returnActionSchema = z.object({
  remarks: z.string().min(1, "Remarks are required when returning an application"),
})
