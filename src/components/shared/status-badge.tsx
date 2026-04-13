import { cn } from "@/lib/utils"
import type { MtopStatus } from "@/types/database"

const statusConfig: Record<
  MtopStatus,
  { label: string; dot: string; className: string }
> = {
  for_verification: {
    label: "For Verification",
    dot: "bg-yellow-500",
    className: "bg-yellow-50 text-yellow-800 ring-1 ring-yellow-200",
  },
  for_inspection: {
    label: "For Inspection",
    dot: "bg-blue-500",
    className: "bg-blue-50 text-blue-800 ring-1 ring-blue-200",
  },
  for_assessment: {
    label: "For Assessment",
    dot: "bg-orange-500",
    className: "bg-orange-50 text-orange-800 ring-1 ring-orange-200",
  },
  for_approval: {
    label: "For Approval",
    dot: "bg-violet-500",
    className: "bg-violet-50 text-violet-800 ring-1 ring-violet-200",
  },
  granted: {
    label: "Granted",
    dot: "bg-green-500",
    className: "bg-green-50 text-green-800 ring-1 ring-green-200",
  },
  rejected: {
    label: "Rejected",
    dot: "bg-red-500",
    className: "bg-red-50 text-red-800 ring-1 ring-red-200",
  },
  returned: {
    label: "Returned",
    dot: "bg-rose-500",
    className: "bg-rose-50 text-rose-800 ring-1 ring-rose-200",
  },
}

export function StatusBadge({ status }: { status: MtopStatus }) {
  const config = statusConfig[status]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        config.className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", config.dot)} />
      {config.label}
    </span>
  )
}

export function getStatusLabel(status: MtopStatus): string {
  return statusConfig[status]?.label ?? status
}
