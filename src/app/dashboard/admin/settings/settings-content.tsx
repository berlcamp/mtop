"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2, Loader2, CalendarClock, Bell } from "lucide-react"
import {
  systemSettingsSchema,
  type SystemSettingsFormValues,
} from "@/lib/schemas/mtop"
import {
  updateSystemSettings,
  type SystemSettings,
} from "@/lib/actions/settings"
import { toast } from "sonner"

export function SettingsContent({ settings }: { settings: SystemSettings }) {
  const [saving, setSaving] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(systemSettingsSchema),
    defaultValues: {
      permit_validity_years: settings.permit_validity_years,
      renewal_window_days: settings.renewal_window_days,
    },
  })

  async function onSubmit(data: Record<string, unknown>) {
    setSaving(true)
    const result = await updateSystemSettings(data as SystemSettingsFormValues)
    setSaving(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Settings updated successfully")
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            Permit Validity
          </CardTitle>
          <CardDescription>
            How many years a permit remains valid after being granted. Once this
            period elapses, the permit is considered expired.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="permit_validity_years">Validity period (years)</Label>
            <Input
              id="permit_validity_years"
              type="number"
              min={1}
              max={10}
              className="w-32"
              {...register("permit_validity_years")}
            />
            {errors.permit_validity_years && (
              <p className="text-xs text-destructive">
                {errors.permit_validity_years.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Renewal Window
          </CardTitle>
          <CardDescription>
            How many days before expiration a permit is flagged as "due for
            renewal". This helps staff identify permits that need attention soon.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="renewal_window_days">Renewal window (days)</Label>
            <Input
              id="renewal_window_days"
              type="number"
              min={1}
              max={365}
              className="w-32"
              {...register("renewal_window_days")}
            />
            {errors.renewal_window_days && (
              <p className="text-xs text-destructive">
                {errors.renewal_window_days.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Button type="submit" disabled={saving}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save Settings
      </Button>
    </form>
  )
}
