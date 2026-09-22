import type { RequirementKind } from "@/types/database"

/**
 * How each kind of checklist row is satisfied. The city's paper checklist mixes
 * all of these into one column, but they are cleared at different stages and by
 * different people — so the UI groups them and says so, rather than presenting
 * 20 identical upload boxes.
 */
export const REQUIREMENT_KINDS: Record<
  RequirementKind,
  { label: string; hint: string; acceptsFile: boolean }
> = {
  document: {
    label: "Documents to submit",
    hint: "Attach a scan or photo, then tick to verify.",
    acceptsFile: true,
  },
  payment: {
    label: "Payments",
    hint: "Cleared at the assessment and payment stage.",
    acceptsFile: true,
  },
  inspection: {
    label: "Inspection",
    hint: "Produced by the physical inspection stage.",
    acceptsFile: true,
  },
  appearance: {
    label: "In person",
    hint: "Confirm the applicant appeared personally.",
    acceptsFile: false,
  },
  photo: {
    label: "Photos",
    hint: "Captured on the franchise record.",
    acceptsFile: false,
  },
  surrender: {
    label: "Items surrendered to the city",
    hint: "Confirm the item was handed over.",
    acceptsFile: false,
  },
}

// Fixed display order for the grouped checklist.
export const REQUIREMENT_KIND_ORDER: RequirementKind[] = [
  "document",
  "photo",
  "appearance",
  "inspection",
  "payment",
  "surrender",
]

export function groupByKind<T extends { kind: RequirementKind }>(
  items: T[]
): { kind: RequirementKind; items: T[] }[] {
  return REQUIREMENT_KIND_ORDER.map((kind) => ({
    kind,
    items: items.filter((item) => item.kind === kind),
  })).filter((group) => group.items.length > 0)
}

/**
 * Only mandatory, non-conditional rows block forwarding out of verification.
 * Conditional rows (e.g. the Affidavit of No Franchise, which the ordinance
 * requires only for units from an abandoned MTOP) are shown but never block.
 */
export function isBlocking(item: {
  is_mandatory: boolean
  is_conditional: boolean
}): boolean {
  return item.is_mandatory && !item.is_conditional
}
