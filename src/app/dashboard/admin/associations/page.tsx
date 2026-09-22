import { PageHeader } from "@/components/layout/page-header"
import { AssociationsContent } from "./associations-content"

export default function AdminAssociationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Associations"
        subtitle="Motorcab operators' associations (MODA) that franchises can be registered under"
      />

      <AssociationsContent />
    </div>
  )
}
