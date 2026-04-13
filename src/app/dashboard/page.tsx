import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, Clock, CheckCircle, Banknote } from "lucide-react"

const stats = [
  {
    title: "Total Applications",
    value: "—",
    icon: FileText,
    description: "Current year",
  },
  {
    title: "Pending",
    value: "—",
    icon: Clock,
    description: "In process",
  },
  {
    title: "Granted",
    value: "—",
    icon: CheckCircle,
    description: "This year",
  },
  {
    title: "Revenue",
    value: "—",
    icon: Banknote,
    description: "Total collected",
  },
]

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Motorized Tricycle Operator's Permit Renewal System"
      />

      {/* Stats grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
