/**
 * Where a returned application goes when it is reopened.
 *
 * "Returned" is a side exit, not a stage: the application leaves the pipeline
 * holding everything it had — cleared requirements, inspection result, fees,
 * payments — and waits for the operator to settle whatever the remarks asked
 * for. Reopening puts it back exactly where it left, so a deficiency raised at
 * assessment doesn't cost the office a second verification and inspection.
 *
 * Pure, because the server action decides the stage (a client must not get to
 * name its own) and the button needs to say which stage that will be.
 */

import { getStatusLabel } from "@/components/shared/status-badge"
import type { MtopStatus } from "@/types/database"

/** The pipeline proper, in order. Excludes granted/rejected/returned. */
export const flowStages: MtopStatus[] = [
  "for_verification",
  "for_inspection",
  "for_assessment",
  "for_approval",
]

/** Permission that lets someone act at a stage — and so reopen into it. */
const stagePermissions: Record<string, string> = {
  for_verification: "application.verify",
  for_inspection: "inspection.conduct",
  for_assessment: "assessment.create",
  for_approval: "application.approve",
}

export function stagePermission(stage: MtopStatus): string {
  return stagePermissions[stage] ?? "application.verify"
}

/**
 * The stage as a noun — "Assessment", not the badge's "For Assessment" —
 * so it can sit mid-sentence. Derived from the badge labels rather than
 * listed again, so renaming a status renames it here too.
 */
export function stageName(stage: MtopStatus): string {
  return getStatusLabel(stage).replace(/^For /, "")
}

/**
 * The stage an application was sitting in when it was returned.
 *
 * Each approval log records the status the application moved *into*, so the
 * most recent log naming a pipeline stage is where it was. Creation logs an
 * "Application submitted" entry at for_verification (seedApplicationChildren),
 * so an application returned before it ever moved still resolves correctly.
 * The fallback covers a row whose logs are missing or were pruned.
 */
export function reopenTargetStage(
  logs: { stage: MtopStatus; created_at: string }[]
): MtopStatus {
  const newestFirst = [...logs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  return (
    newestFirst.find((log) => flowStages.includes(log.stage))?.stage ??
    "for_verification"
  )
}
