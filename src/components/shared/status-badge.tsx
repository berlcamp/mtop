import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { MtopStatus } from "@/types/database"

const statusConfig: Record<
  MtopStatus,
  { label: string; className: string }
> = {
  for_verification: {
    label: "For Verification",
    className: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
  },
  for_inspection: {
    label: "For Inspection",
    className: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  },
  for_assessment: {
    label: "For Assessment",
    className: "bg-orange-100 text-orange-800 hover:bg-orange-100",
  },
  for_approval: {
    label: "For Approval",
    className: "bg-violet-100 text-violet-800 hover:bg-violet-100",
  },
  granted: {
    label: "Granted",
    className: "bg-green-100 text-green-800 hover:bg-green-100",
  },
  rejected: {
    label: "Rejected",
    className: "bg-red-100 text-red-800 hover:bg-red-100",
  },
  returned: {
    label: "Returned",
    className: "bg-red-100 text-red-800 hover:bg-red-100",
  },
}

export function StatusBadge({ status }: { status: MtopStatus }) {
  const config = statusConfig[status]
  return (
    <Badge variant="secondary" className={cn("font-medium", config.className)}>
      {config.label}
    </Badge>
  )
}

export function getStatusLabel(status: MtopStatus): string {
  return statusConfig[status]?.label ?? status
}
