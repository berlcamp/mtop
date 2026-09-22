"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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
import { Camera, Loader2, Pencil } from "lucide-react"
import { InfoItem } from "@/components/shared/info-item"
import { PhotoSlot } from "@/components/mtop/photo-capture"
import {
  updateFranchisePhoto,
  updateFranchiseDriverDetails,
} from "@/lib/actions/franchises"
import { createClient } from "@/lib/supabase/client"

const BUCKET = "mtop-documents"

/**
 * Turns a public storage URL back into its object path so an old portrait can
 * be removed once its replacement is saved.
 */
function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/${BUCKET}/`
  const index = url.indexOf(marker)
  if (index === -1) return null
  return decodeURIComponent(url.slice(index + marker.length).split("?")[0])
}

type Slot = "owner" | "driver"

interface FranchisePhotosCardProps {
  franchiseId: string
  applicationId: string
  ownerPhotoUrl: string | null
  driverPhotoUrl: string | null
  driverName: string | null
  driverLicenseNumber: string | null
  driverAddress: string | null
  make: string | null
  dayOff: string | null
  canEdit: boolean
}

export function FranchisePhotosCard({
  franchiseId,
  applicationId,
  ownerPhotoUrl,
  driverPhotoUrl,
  driverName,
  driverLicenseNumber,
  driverAddress,
  make,
  dayOff,
  canEdit,
}: FranchisePhotosCardProps) {
  const [photos, setPhotos] = useState<Record<Slot, string | null>>({
    owner: ownerPhotoUrl,
    driver: driverPhotoUrl,
  })
  const [busySlot, setBusySlot] = useState<Slot | null>(null)
  const [error, setError] = useState<string | null>(null)

  const router = useRouter()

  // What is on record, and what is being typed over it. Kept apart so the
  // read-only view can update the moment a save lands, rather than waiting on
  // the refresh to bring the new props round.
  const [saved, setSaved] = useState({
    driver_name: driverName ?? "",
    driver_license_number: driverLicenseNumber ?? "",
    driver_address: driverAddress ?? "",
    make: make ?? "",
    day_off: dayOff ?? "",
  })
  const [form, setForm] = useState(saved)
  const [editing, setEditing] = useState(false)
  const [savingDriver, setSavingDriver] = useState(false)

  async function removeStoredPhoto(url: string | null) {
    if (!url) return
    const path = storagePathFromPublicUrl(url)
    if (!path) return
    // Best-effort — an orphaned object is not worth failing the save over.
    await createClient().storage.from(BUCKET).remove([path])
  }

  /** Uploads the capture, persists its URL, then drops the photo it replaced. */
  async function handleCapture(slot: Slot, blob: Blob): Promise<string | null> {
    setBusySlot(slot)
    setError(null)

    try {
      const supabase = createClient()
      const path = `photos/${franchiseId}/mtop_${slot}_${Date.now()}.jpg`

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: "image/jpeg" })

      if (uploadErr) return uploadErr.message

      const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path)
        .data.publicUrl

      const result = await updateFranchisePhoto(
        franchiseId,
        applicationId,
        slot,
        publicUrl
      )

      if (result.error) {
        await supabase.storage.from(BUCKET).remove([path])
        return result.error
      }

      const previous = photos[slot]
      setPhotos((prev) => ({ ...prev, [slot]: publicUrl }))
      await removeStoredPhoto(previous)

      return null
    } catch (e) {
      return (e as Error).message
    } finally {
      setBusySlot(null)
    }
  }

  async function handleRemove(slot: Slot) {
    setBusySlot(slot)
    setError(null)

    try {
      const result = await updateFranchisePhoto(
        franchiseId,
        applicationId,
        slot,
        null
      )
      if (result.error) {
        setError(result.error)
        return
      }

      const previous = photos[slot]
      setPhotos((prev) => ({ ...prev, [slot]: null }))
      await removeStoredPhoto(previous)
    } finally {
      setBusySlot(null)
    }
  }

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function startEditing() {
    // Always open on what is currently on record, not on whatever was typed
    // and abandoned last time.
    setForm(saved)
    setError(null)
    setEditing(true)
  }

  async function handleSaveDriver() {
    setSavingDriver(true)
    setError(null)

    const result = await updateFranchiseDriverDetails(
      franchiseId,
      applicationId,
      form
    )

    if (result.error) {
      setError(result.error)
      setSavingDriver(false)
      return
    }

    setSaved(form)
    setSavingDriver(false)
    setEditing(false)
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <Camera className="h-4 w-4" />
              Photos &amp; Card Details
            </CardTitle>
            <CardDescription>
              Portraits and driver information used to generate the Franchise
              Card.
            </CardDescription>
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
      <CardContent className="space-y-6">
        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap gap-8">
          <PhotoSlot
            label="Franchise Owner"
            photoUrl={photos.owner}
            canEdit={canEdit}
            busy={busySlot === "owner"}
            onCapture={(blob) => handleCapture("owner", blob)}
            onRemove={() => handleRemove("owner")}
          />
          <PhotoSlot
            label="Driver"
            photoUrl={photos.driver}
            canEdit={canEdit}
            busy={busySlot === "driver"}
            onCapture={(blob) => handleCapture("driver", blob)}
            onRemove={() => handleRemove("driver")}
          />
        </div>

        {editing ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="driver_name">Driver Name</Label>
                <Input
                  id="driver_name"
                  value={form.driver_name}
                  onChange={(e) => set("driver_name", e.target.value)}
                  disabled={savingDriver}
                  placeholder="Full name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="driver_license_number">
                  Driver&apos;s License No.
                </Label>
                <Input
                  id="driver_license_number"
                  value={form.driver_license_number}
                  onChange={(e) =>
                    set("driver_license_number", e.target.value)
                  }
                  disabled={savingDriver}
                  placeholder="License number"
                  className="font-mono"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="driver_address">Driver Address</Label>
                <Input
                  id="driver_address"
                  value={form.driver_address}
                  onChange={(e) => set("driver_address", e.target.value)}
                  disabled={savingDriver}
                  placeholder="Address"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="make">Make</Label>
                <Input
                  id="make"
                  value={form.make}
                  onChange={(e) => set("make", e.target.value)}
                  disabled={savingDriver}
                  placeholder="e.g. Kawasaki"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="day_off">Day Off</Label>
                <Input
                  id="day_off"
                  value={form.day_off}
                  onChange={(e) => set("day_off", e.target.value)}
                  disabled={savingDriver}
                  placeholder="e.g. Every Tuesday and Sunday"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSaveDriver} disabled={savingDriver}>
                {savingDriver && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save Changes
              </Button>
              <Button
                variant="outline"
                onClick={() => setEditing(false)}
                disabled={savingDriver}
              >
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2">
            <InfoItem label="Driver Name" value={saved.driver_name} />
            <InfoItem
              label="Driver's License No."
              value={saved.driver_license_number}
              mono
            />
            <InfoItem
              label="Driver Address"
              value={saved.driver_address}
              className="sm:col-span-2"
            />
            <InfoItem label="Make" value={saved.make} />
            <InfoItem label="Day Off" value={saved.day_off} />
          </dl>
        )}
      </CardContent>
    </Card>
  )
}
