/**
 * Body- and plate-number rules, mirroring mtop.normalize_unit_identifier() in
 * 20260413000021_unique_unit_identifiers.sql.
 *
 * The database is what actually enforces uniqueness (two partial unique
 * indexes over active franchises). This copy exists so the forms can warn
 * while the clerk is still typing, and so the server actions can return a
 * sentence naming the franchise in the way instead of a constraint violation.
 * If you change one side, change the other.
 */

/** The field a conflict was found on, as the database reports it. */
export type UnitIdentifierField = "tricycle_body_number" | "plate_number"

/** The franchise already using a body or plate number. */
export type UnitIdentifierConflict = {
  field: UnitIdentifierField
  id: string
  mtop_number: string | null
  applicant_name: string
  value: string | null
}

/**
 * " ab-1234 " -> "AB1234".
 *
 * Upper-cases and drops everything that is not a letter or a digit, so
 * spacing and punctuation can't let the same number through twice.
 * Deliberately not fuzzy: "AB1234" and "AB12345" are two different units.
 */
export function normalizeUnitIdentifier(value: string): string {
  return value.replace(/[^\p{L}\p{N}]/gu, "").toUpperCase()
}

const FIELD_LABEL: Record<UnitIdentifierField, string> = {
  tricycle_body_number: "Body number",
  plate_number: "Plate number",
}

/**
 * The one sentence a clerk needs: which number is taken, and by whom.
 * `subject` overrides the field's own label for the staged plate on a change
 * of unit, where "Plate number" alone would read as the current one.
 */
export function unitConflictMessage(
  conflict: UnitIdentifierConflict,
  subject?: string
): string {
  const label = subject ?? FIELD_LABEL[conflict.field]
  const held = conflict.mtop_number
    ? `MTOP ${conflict.mtop_number}`
    : "a franchise whose application is still in progress"

  return `${label} ${conflict.value ?? ""}`.trim() +
    ` is already on ${held} (${conflict.applicant_name}). Body and plate numbers identify one tricycle — check the number, or close that franchise first.`
}
