import { PageHeader } from "@/components/layout/page-header"
import { getSystemSettings } from "@/lib/actions/settings"
import { SettingsContent } from "./settings-content"

export default async function AdminSettingsPage() {
  const { data: settings } = await getSystemSettings()

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Settings"
        subtitle="Configure permit validity, renewal monitoring, and office contact details"
      />

      <SettingsContent settings={settings} />
    </div>
  )
}
