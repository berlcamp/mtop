"use client"

import { useRef, useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Camera, Loader2 } from "lucide-react"
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

  const [driver, setDriver] = useState({
    driver_name: driverName ?? "",
    driver_license_number: driverLicenseNumber ?? "",
    driver_address: driverAddress ?? "",
    make: make ?? "",
    day_off: dayOff ?? "",
  })
  const [savingDriver, setSavingDriver] = useState(false)
  const saveTimeout = useRef<NodeJS.Timeout | null>(null)

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

  function handleDriverChange(field: keyof typeof driver, value: string) {
    const next = { ...driver, [field]: value }
    setDriver(next)

    // Debounced save, same pattern as the document remarks field.
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(async () => {
      setSavingDriver(true)
      setError(null)
      const result = await updateFranchiseDriverDetails(
        franchiseId,
        applicationId,
        next
      )
      if (result.error) setError(result.error)
      setSavingDriver(false)
    }, 800)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Camera className="h-4 w-4" />
          Photos &amp; Card Details
          {savingDriver && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </CardTitle>
        <CardDescription>
          Portraits and driver information used to generate the Franchise Card.
        </CardDescription>
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="driver_name" className="text-xs">
              Driver Name
            </Label>
            <Input
              id="driver_name"
              value={driver.driver_name}
              onChange={(e) => handleDriverChange("driver_name", e.target.value)}
              disabled={!canEdit}
              placeholder="Full name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="driver_license_number" className="text-xs">
              Driver&apos;s License No.
            </Label>
            <Input
              id="driver_license_number"
              value={driver.driver_license_number}
              onChange={(e) =>
                handleDriverChange("driver_license_number", e.target.value)
              }
              disabled={!canEdit}
              placeholder="License number"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="driver_address" className="text-xs">
              Driver Address
            </Label>
            <Input
              id="driver_address"
              value={driver.driver_address}
              onChange={(e) =>
                handleDriverChange("driver_address", e.target.value)
              }
              disabled={!canEdit}
              placeholder="Address"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="make" className="text-xs">
              Make
            </Label>
            <Input
              id="make"
              value={driver.make}
              onChange={(e) => handleDriverChange("make", e.target.value)}
              disabled={!canEdit}
              placeholder="e.g. Kawasaki"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="day_off" className="text-xs">
              Day Off
            </Label>
            <Input
              id="day_off"
              value={driver.day_off}
              onChange={(e) => handleDriverChange("day_off", e.target.value)}
              disabled={!canEdit}
              placeholder="e.g. Every Tuesday and Sunday"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
