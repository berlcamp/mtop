"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Camera,
  CameraOff,
  CarFront,
  ImageUp,
  Loader2,
  RefreshCw,
  Trash2,
  User,
} from "lucide-react"
import { isCameraPreviewReady } from "@/lib/camera-preview"
import { cameraLabel, startCameraPreview, type CameraState } from "@/lib/camera-session"
import { normalizePhoto, type PhotoMode } from "@/lib/photo-normalization"

interface CameraCaptureDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  mode?: PhotoMode
  /** Receives the normalized JPEG. Return an error message to keep the dialog open. */
  onCapture: (blob: Blob) => Promise<string | null> | string | null | void
}

export function CameraCaptureDialog({
  open,
  onOpenChange,
  title,
  mode = "portrait",
  onCapture,
}: CameraCaptureDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null)
  const sessionRef = useRef<ReturnType<typeof startCameraPreview> | null>(null)
  const [cameraState, setCameraState] = useState<CameraState>({ status: "starting" })
  const cameraReady = cameraState.status === "ready"
  const starting = cameraState.status === "starting"
  const cameraError = cameraState.error ?? null
  const [retry, setRetry] = useState(0)
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null)
  const photoOperationRef = useRef(0)
  const stillUrlRef = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // The frozen still awaiting confirmation — null means the live view is showing.
  const [still, setStill] = useState<{ blob: Blob; url: string } | null>(null)

  const stopStream = useCallback(() => {
    sessionRef.current?.stop()
    sessionRef.current = null
  }, [])

  const attachVideo = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node
    setVideoElement(node)
  }, [])

  useEffect(() => {
    if (open) videoElement?.closest("[data-slot=dialog-content]")
      ?.querySelector("[data-slot=camera-dialog-scroll]")?.scrollTo({ top: 0 })
  }, [open, videoElement])

  // Acquisition starts only once the portaled video is mounted. Every effect
  // owns one session; cleanup invalidates and stops even late permission results.
  useEffect(() => {
    if (!open || still || !videoElement) return
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraState({ status: "error", error: !window.isSecureContext
        ? "Camera access requires HTTPS or localhost. Open a secure address, or upload a photo instead."
        : "This browser does not support camera access. Upload a photo instead." })
      return
    }
    const session = startCameraPreview(videoElement, navigator.mediaDevices, {
      deviceId,
      onState: setCameraState,
      onDevices: setDevices,
      onSelectedDevice: setActiveDeviceId,
    })
    sessionRef.current = session
    return () => {
      session.stop()
      if (sessionRef.current === session) sessionRef.current = null
    }
  }, [open, still, videoElement, deviceId, retry])

  useEffect(() => {
    const operations = photoOperationRef
    if (!open) {
      stopStream()
      setCameraState({ status: "starting" })
      setStill(null)
      setSaveError(null)
      setSaving(false)
    }
    // Invalidate image decoding/encoding callbacks on close and unmount.
    return () => {
      operations.current++
      if (stillUrlRef.current) URL.revokeObjectURL(stillUrlRef.current)
      stillUrlRef.current = null
    }
  }, [open, stopStream])

  function showStill(blob: Blob) {
    if (stillUrlRef.current) URL.revokeObjectURL(stillUrlRef.current)
    const url = URL.createObjectURL(blob)
    stillUrlRef.current = url
    stopStream()
    setStill({ blob, url })
  }

  async function handleCapture() {
    const video = videoRef.current
    const stream = sessionRef.current?.getStream() ?? null
    if (!cameraReady || !video || !isCameraPreviewReady(video, stream, true, true)) {
      setCameraState({ status: "error", error: "The live camera is not ready. Retry or upload a photo instead." })
      stopStream()
      return
    }

    setSaveError(null)
    const operation = ++photoOperationRef.current
    try {
      const blob = await normalizePhoto(video, video.videoWidth, video.videoHeight)
      if (operation === photoOperationRef.current) showStill(blob)
    } catch (err) {
      if (operation === photoOperationRef.current) setSaveError((err as Error).message)
    }
  }

  function handleRetake() {
    setSaveError(null)
    setCameraState({ status: "starting" })
    if (stillUrlRef.current) URL.revokeObjectURL(stillUrlRef.current)
    stillUrlRef.current = null
    setStill(null)
  }

  async function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (fileInputRef.current) fileInputRef.current.value = ""
    if (!file) return

    setSaveError(null)
    const operation = ++photoOperationRef.current
    const objectUrl = URL.createObjectURL(file)

    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new window.Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error("That file is not a readable image."))
        el.src = objectUrl
      })

      const blob = await normalizePhoto(
        img,
        img.naturalWidth,
        img.naturalHeight,
        mode === "vehicle"
      )
      if (operation === photoOperationRef.current) showStill(blob)
    } catch (err) {
      if (operation === photoOperationRef.current) setSaveError((err as Error).message)
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  async function handleUsePhoto() {
    if (!still) return

    setSaving(true)
    setSaveError(null)
    try {
      const result = await onCapture(still.blob)
      if (typeof result === "string" && result) {
        setSaveError(result)
        return
      }
      onOpenChange(false)
    } catch (err) {
      setSaveError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      // The page-wide overlay sits outside this dialog while the photo is
      // saved, so a click on it reads as a click outside — which must not
      // close the dialog and lose the error if the save fails.
      onOpenChange={(next) => {
        if (!next && saving) return
        onOpenChange(next)
      }}
    >
      <DialogContent initialFocus={titleRef} className="flex max-h-[calc(100dvh-2rem)] flex-col p-0 sm:max-w-md">
        <div data-slot="camera-dialog-scroll" className="min-h-0 min-w-0 space-y-4 overflow-y-auto rounded-xl p-5">
          <DialogHeader className="min-w-0 pr-6">
            <DialogTitle ref={titleRef} tabIndex={-1}>{title}</DialogTitle>
            <DialogDescription className="break-words">
              {mode === "vehicle"
                ? "Fit the entire unit in the portrait preview. Capture saves this view. Uploaded unit photos keep the full image with padding."
                : "Position the face inside the guide, then capture. The photo is saved as a portrait ID shot."}
            </DialogDescription>
          </DialogHeader>

          <div className="min-w-0 space-y-3">
            <div className="relative mx-auto aspect-[3/4] w-full max-w-56 overflow-hidden rounded-md bg-muted ring-1 ring-inset ring-border">
              {still ? (
                // Object URL of a just-captured blob — next/image can't optimize it.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={still.url}
                  alt="Captured photo preview"
                  className="absolute inset-0 h-full w-full object-cover object-center"
                />
              ) : (
                <>
                  <video
                    ref={attachVideo}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 h-full w-full object-cover object-center"
                  />
                  {/* Framing guide */}
                  <div className="pointer-events-none absolute inset-0">
                    {mode === "portrait" ? (
                      <div className="absolute inset-x-[15%] inset-y-[10%] rounded-full border-2 border-dashed border-white/60" />
                    ) : (
                      <div className="absolute inset-x-[8%] inset-y-[6%] rounded-md border-2 border-dashed border-white/60" />
                    )}
                  </div>
                  {cameraError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/95 p-4 text-center">
                      <CameraOff className="h-6 w-6 text-muted-foreground" />
                      <p role="alert" className="text-xs text-muted-foreground">{cameraError}</p>
                      <Button type="button" size="sm" variant="outline" onClick={() => setRetry((value) => value + 1)}>Retry camera</Button>
                    </div>
                  )}
                  {(!cameraError && !cameraReady) && (
                    <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/90 p-3 text-center">
                      {starting ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">Initializing camera…</p>
                        </>
                      ) : (
                        <p className="p-3 text-center text-xs text-muted-foreground">Waiting for live camera video…</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {!still && devices.length > 1 && (
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="capture-camera" className="text-xs">Camera</Label>
                <Select
                  items={devices.map((device, index) => ({ value: device.deviceId, label: cameraLabel(device.label, index, device.deviceId) }))}
                  value={activeDeviceId}
                  onValueChange={(value) => {
                    stopStream()
                    setCameraState({ status: "starting" })
                    setActiveDeviceId(value)
                    setDeviceId(value ?? undefined)
                  }}
                >
                  <SelectTrigger id="capture-camera" className="w-full min-w-0 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate">
                    <SelectValue className="block min-w-0 truncate" placeholder="Select camera">
                      {cameraLabel(devices.find((device) => device.deviceId === activeDeviceId)?.label ?? "", Math.max(0, devices.findIndex((device) => device.deviceId === activeDeviceId)), activeDeviceId ?? "")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false} className="max-w-[calc(100vw-2rem)]">
                    {devices.map((device, index) => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>
                        <span className="block min-w-0 max-w-full truncate">
                          {cameraLabel(device.label, index, device.deviceId)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {saveError && (
              <p className="text-sm text-destructive">{saveError}</p>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFilePicked}
          />

          <DialogFooter className="min-w-0 gap-2 sm:flex-wrap sm:justify-between">
            {still ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRetake}
                  disabled={saving}
                >
                  <RefreshCw className="h-4 w-4" />
                  Retake
                </Button>
                <Button type="button" onClick={handleUsePhoto} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                  Use Photo
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImageUp className="h-4 w-4" />
                  Upload instead
                </Button>
                <Button
                  type="button"
                  onClick={handleCapture}
                  disabled={starting || !!cameraError || !cameraReady}
                >
                  <Camera className="h-4 w-4" />
                  Capture
                </Button>
              </>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface PhotoSlotProps {
  label: string
  photoUrl: string | null
  canEdit: boolean
  busy?: boolean
  onCapture: (blob: Blob) => Promise<string | null> | string | null | void
  onRemove: () => void
  mode?: PhotoMode
}

export function PhotoSlot({
  label,
  photoUrl,
  canEdit,
  busy,
  onCapture,
  onRemove,
  mode = "portrait",
}: PhotoSlotProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>

      <div className="relative aspect-[3/4] w-full max-w-64 overflow-hidden rounded-md border bg-muted">
        {photoUrl ? (
          // Supabase storage host isn't in next.config remotePatterns; a plain
          // img keeps this component free of image config.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={label}
            className={`h-full w-full ${mode === "vehicle" ? "object-contain" : "object-cover"}`}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            {mode === "vehicle" ? <CarFront className="h-8 w-8 text-muted-foreground/50" /> : <User className="h-8 w-8 text-muted-foreground/50" />}
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/70">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setDialogOpen(true)}
            disabled={busy}
          >
            <Camera className="h-3.5 w-3.5" />
            {photoUrl ? "Retake" : "Capture"}
          </Button>
          {photoUrl && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onRemove}
              disabled={busy}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </Button>
          )}
        </div>
      )}

      <CameraCaptureDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={`Capture ${label}`}
        mode={mode}
        onCapture={onCapture}
      />
    </div>
  )
}
