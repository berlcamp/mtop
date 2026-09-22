/**
 * Operator addresses.
 *
 * An address is stored in three places at once, on purpose:
 *
 *   barangay  — a foreign key into mtop.barangays, so it can be counted
 *   purok     — free text, because puroks have no citywide register
 *   applicant_address — the two composed into one readable line
 *
 * The composed line is what the permit, search, reports and the audit trail
 * read, so nothing downstream has to know the address is structured. It is
 * written at filing time by the server actions, never edited directly.
 *
 * Franchises registered before 20260413000020 have a free-text
 * applicant_address and no barangay; `displayAddress` handles both.
 */

export const CITY = "Ozamiz City"

/**
 * The stored one-line form: "Purok 5, Banadero, Ozamiz City".
 *
 * `includeCity` is off for the franchise card, whose letterhead already says
 * Ozamiz City — the permit's address line is narrow and the repetition is what
 * pushes a long barangay name past the edge of the paper.
 */
export function composeAddress(
  purok: string | null | undefined,
  barangay: string | null | undefined,
  { includeCity = true }: { includeCity?: boolean } = {}
): string {
  const parts = [purok?.trim(), barangay?.trim()].filter(
    (part): part is string => Boolean(part)
  )
  if (parts.length === 0) return ""
  return includeCity ? [...parts, CITY].join(", ") : parts.join(", ")
}

/**
 * What to show for a franchise's address: the structured form when it has one,
 * and the legacy free-text line when it doesn't.
 */
export function displayAddress(
  franchise: {
    purok?: string | null
    barangay?: string | null
    applicant_address?: string | null
  },
  options?: { includeCity?: boolean }
): string {
  if (franchise.barangay) {
    return composeAddress(franchise.purok, franchise.barangay, options)
  }
  return franchise.applicant_address?.trim() ?? ""
}
