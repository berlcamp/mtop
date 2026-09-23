"use client"

import { useState } from "react"
import { useGuardedAction } from "@/components/shared/guarded-action"
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
import { Bike, MapPin, Building2, Calendar, AlertCircle, Loader2, Pencil } from "lucide-react"
import { InfoItem } from "@/components/shared/info-item"
import { AssociationSelect } from "@/components/mtop/association-select"
import { updateFranchiseUnitDetails } from "@/lib/actions/franchises"

interface FranchiseUnit {
  id: string
  tricycle_body_number: string | null
  plate_number: string | null
  motor_number: string
  chassis_number: string
  route: string | null
  association_id: string | null
  association?: { id: string; name: string } | null
}

/**
 * The unit's identity as recorded on the franchise.
 *
 * Read-only for everyone by design: motor and chassis numbers are what a
 * change-of-unit transaction exists to alter, and that route keeps the old
 * values in mtop.franchise_unit_history. `canEdit` is set only for an
 * administrator on an application that has not been granted, so a mis-keyed
 * record can be corrected without inventing a transaction that never happened.
 * The audit trigger logs the before and after regardless.
 */
export function TricycleDetailsCard({
  franchise,
  applicationId,
  fiscalYear,
  canEdit,
}: {
  franchise: FranchiseUnit
  applicationId: string
  fiscalYear?: string
  canEdit: boolean
}) {
  const guard = useGuardedAction()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    tricycle_body_number: franchise.tricycle_body_number ?? "",
    plate_number: franchise.plate_number ?? "",
    motor_number: franchise.motor_number ?? "",
    chassis_number: franchise.chassis_number ?? "",
    route: franchise.route ?? "",
    association_id: franchise.association_id ?? "",
  })

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function startEditing() {
    // Always open on what is currently on record, not on whatever was typed
    // and abandoned last time.
    setForm({
      tricycle_body_number: franchise.tricycle_body_number ?? "",
      plate_number: franchise.plate_number ?? "",
      motor_number: franchise.motor_number ?? "",
      chassis_number: franchise.chassis_number ?? "",
      route: franchise.route ?? "",
      association_id: franchise.association_id ?? "",
    })
    setError(null)
    setEditing(true)
  }

  async function handleSave() {
    const ok = await guard.confirm({
      title: "Save the corrected tricycle details?",
      description:
        "This overwrites the unit on record. The audit trail keeps the old values.",
      confirmLabel: "Save Changes",
    })
    if (!ok) return

    guard.start("Saving the tricycle details…")
    setSaving(true)
    setError(null)

    const result = await updateFranchiseUnitDetails(franchise.id, applicationId, {
      tricycle_body_number: form.tricycle_body_number,
      plate_number: form.plate_number,
      motor_number: form.motor_number,
      chassis_number: form.chassis_number,
      route: form.route,
      association_id: form.association_id || null,
    })

    if (result.error) {
      setError(result.error)
      setSaving(false)
      guard.stop()
      return
    }

    // Back to the record only once it shows the corrected values.
    guard.finish(() => {
      setSaving(false)
      setEditing(false)
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <Bike className="h-4 w-4" />
              Tricycle Details
            </CardTitle>
            {editing && (
              <CardDescription>
                Correcting the record itself. A unit that was actually replaced
                should be filed as a change of unit instead, so the old numbers
                are kept as history.
              </CardDescription>
            )}
          </div>
          {canEdit && !editing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={startEditing}
            >
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {editing ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit_body_number">Body Number</Label>
                <Input
                  id="edit_body_number"
                  value={form.tricycle_body_number}
                  onChange={(e) => set("tricycle_body_number", e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_plate_number">Plate Number</Label>
                <Input
                  id="edit_plate_number"
                  value={form.plate_number}
                  onChange={(e) => set("plate_number", e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_motor_number">Motor Number</Label>
                <Input
                  id="edit_motor_number"
                  value={form.motor_number}
                  onChange={(e) => set("motor_number", e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_chassis_number">Chassis Number</Label>
                <Input
                  id="edit_chassis_number"
                  value={form.chassis_number}
                  onChange={(e) => set("chassis_number", e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_route">Route</Label>
                <Input
                  id="edit_route"
                  value={form.route}
                  onChange={(e) => set("route", e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_association">Association</Label>
                <AssociationSelect
                  id="edit_association"
                  value={form.association_id}
                  onChange={(e) => set("association_id", e.target.value)}
                  disabled={saving}
                  currentAssociation={
                    franchise.association_id
                      ? {
                          id: franchise.association_id,
                          name:
                            franchise.association?.name ??
                            "Current association",
                        }
                      : null
                  }
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
              <Button
                variant="outline"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2">
            <InfoItem
              label="Body Number"
              value={franchise.tricycle_body_number}
              mono
            />
            <InfoItem label="Plate Number" value={franchise.plate_number} mono />
            <InfoItem label="Motor Number" value={franchise.motor_number} mono />
            <InfoItem
              label="Chassis Number"
              value={franchise.chassis_number}
              mono
            />
            <InfoItem
              label="Route"
              value={franchise.route}
              icon={<MapPin className="h-3.5 w-3.5" />}
            />
            <InfoItem
              label="Association"
              // No association is a real state (strikers), not missing data,
              // so say so rather than showing a bare dash.
              value={franchise.association?.name ?? "No association (striker)"}
              icon={<Building2 className="h-3.5 w-3.5" />}
            />
            <InfoItem
              label="Fiscal Year"
              value={fiscalYear}
              icon={<Calendar className="h-3.5 w-3.5" />}
            />
          </dl>
        )}
      </CardContent>
      {guard.element}
    </Card>
  )
}
