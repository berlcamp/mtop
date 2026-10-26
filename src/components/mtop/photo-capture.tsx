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

// Portrait ID proportions — the Franchise Card expects 3:4.
const PHOTO_WIDTH = 600
const PHOTO_HEIGHT = 800
const PHOTO_ASPECT = PHOTO_WIDTH / PHOTO_HEIGHT
const JPEG_QUALITY = 0.85

type PhotoMode = "portrait" | "vehicle"

/**
 * Draws a center-cropped 3:4 portrait of `source` onto a 600x800 canvas and
 * returns it as a JPEG blob. Webcams hand us 4:3 landscape and phone photos can
 * be anything, so both paths go through here to produce identical output.
 */
function normalizeToPortraitJpeg(
  source: HTMLVideoElement | HTMLImageElement,
  sourceWidth: number,
  sourceHeight: number
): Promise<Blob> {
  const canvas = document.createElement("canvas")
  canvas.width = PHOTO_WIDTH
  canvas.height = PHOTO_HEIGHT

  const ctx = canvas.getContext("2d")
  if (!ctx) return Promise.reject(new Error("Canvas is not available."))

  let sw = sourceWidth
  let sh = sourceHeight

  if (sourceWidth / sourceHeight > PHOTO_ASPECT) {
    sw = sourceHeight * PHOTO_ASPECT
  } else {
    sh = sourceWidth / PHOTO_ASPECT
  }

  const sx = (sourceWidth - sw) / 2
  const sy = (sourceHeight - sh) / 2

  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Failed to encode the photo.")),
      "image/jpeg",
      JPEG_QUALITY
    )
  })
}

function normalizeVehicleToPortraitJpeg(
  source: HTMLVideoElement | HTMLImageElement,
  sourceWidth: number,
  sourceHeight: number
): Promise<Blob> {
  const canvas = document.createElement("canvas")
  canvas.width = PHOTO_WIDTH
  canvas.height = PHOTO_HEIGHT
  const ctx = canvas.getContext("2d")
  if (!ctx) return Promise.reject(new Error("Canvas is not available."))

  // Keep the complete vehicle visible inside the 3:4 portrait output. Neutral
  // padding is preferable to cropping the front or rear off a landscape unit.
  ctx.fillStyle = "#f4f4f5"
  ctx.fillRect(0, 0, PHOTO_WIDTH, PHOTO_HEIGHT)
  const scale = Math.min(PHOTO_WIDTH / sourceWidth, PHOTO_HEIGHT / sourceHeight)
  const drawWidth = sourceWidth * scale
  const drawHeight = sourceHeight * scale
  ctx.drawImage(
    source,
    (PHOTO_WIDTH - drawWidth) / 2,
    (PHOTO_HEIGHT - drawHeight) / 2,
    drawWidth,
    drawHeight
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Failed to encode the photo.")),
      "image/jpeg",
      JPEG_QUALITY
    )
  })
}

function normalizePhoto(mode: PhotoMode, source: HTMLVideoElement | HTMLImageElement, width: number, height: number) {
  return mode === "vehicle"
    ? normalizeVehicleToPortraitJpeg(source, width, height)
    : normalizeToPortraitJpeg(source, width, height)
}

function describeCameraError(err: unknown): string {
  const name = (err as { name?: string })?.name
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access was blocked. Allow camera access in your browser, or upload a photo file instead."
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No webcam was found on this computer. Upload a photo file instead."
  }
  if (name === "NotReadableError") {
    return "The webcam is already in use by another application. Close it and try again, or upload a photo file instead."
  }
  return (err as Error)?.message ?? "The camera could not be started."
}

function cameraLabel(label: string, index: number): string {
  const readable = label.trim() || `Camera ${index + 1}`
  return readable.length > 48 ? `${readable.slice(0, 45)}…` : readable
}

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
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const cameraGenerationRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined)
  const [starting, setStarting] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // The frozen still awaiting confirmation — null means the live view is showing.
  const [still, setStill] = useState<{ blob: Blob; url: string } | null>(null)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraStream(null)
    setCameraReady(false)
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const attachVideo = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node
    setVideoElement(node)
  }, [])

  // Start (or restart, when the selected camera changes) the live preview.
  useEffect(() => {
    if (!open || still) return

    let cancelled = false
    const generation = ++cameraGenerationRef.current
    setStarting(true)
    setCameraReady(false)
    setCameraError(null)
    stopStream()

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          window.isSecureContext
            ? "This browser does not support camera access. Upload a photo file instead."
            : "Camera access requires a secure browser context. Use https:// or localhost, or upload a photo file instead."
        )
        setStarting(false)
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : { width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        })

        if (cancelled || cameraGenerationRef.current !== generation) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream
        setCameraStream(stream)

        // Device labels are only populated once permission has been granted.
        const all = await navigator.mediaDevices.enumerateDevices()
        if (!cancelled && cameraGenerationRef.current === generation) {
          setDevices(all.filter((d) => d.kind === "videoinput"))
        }
      } catch (err) {
        if (!cancelled && cameraGenerationRef.current === generation) {
          setCameraError(describeCameraError(err))
        }
      } finally {
        if (!cancelled && cameraGenerationRef.current === generation) setStarting(false)
      }
    }

    start()

    return () => {
      cancelled = true
      cameraGenerationRef.current = generation + 1
      const stream = streamRef.current
      stream?.getTracks().forEach((track) => track.stop())
      if (streamRef.current === stream) streamRef.current = null
      setCameraStream((current) => current === stream ? null : current)
      if (videoRef.current?.srcObject === stream) videoRef.current.srcObject = null
      setCameraReady(false)
    }
  }, [open, still, deviceId, stopStream])

  // Dialog content is portaled, so attach only after React has mounted the
  // actual video element. Acquisition and playback have separate lifecycles.
  useEffect(() => {
    const video = videoElement
    const stream = cameraStream
    if (!video || !stream || !open || still) return

    let active = true
    let playbackStarted = false
    let frameReceived = false
    let frameCallbackId: number | undefined
    const playingHandler = () => {
      playbackStarted = true
      updateReady()
    }

    function updateReady() {
      if (!active || !video) return
      setCameraReady(isCameraPreviewReady(video, stream, playbackStarted, frameReceived))
    }
    function onFrame() {
      if (!active) return
      frameReceived = true
      updateReady()
    }
    function onTrackEnded() {
      if (!active) return
      setCameraReady(false)
      setCameraError("The camera stream stopped. Restart the dialog or upload a photo file instead.")
      setStarting(false)
    }
    function onTrackMute() {
      if (active) setCameraReady(false)
    }
    function onTrackUnmute() {
      if (active) updateReady()
    }
    function onPlaybackError() {
      if (!active) return
      setCameraReady(false)
      setCameraError("The camera preview could not play. Check browser camera access and try again, or upload a photo file instead.")
      setStarting(false)
    }

    video.autoplay = true
    video.muted = true
    video.playsInline = true
    video.srcObject = stream
    video.addEventListener("loadedmetadata", updateReady)
    video.addEventListener("canplay", onFrame)
    video.addEventListener("playing", playingHandler)
    video.addEventListener("error", onPlaybackError)
    const tracks = stream.getVideoTracks()
    tracks.forEach((track) => {
      track.addEventListener("ended", onTrackEnded)
      track.addEventListener("mute", onTrackMute)
      track.addEventListener("unmute", onTrackUnmute)
    })

    if (typeof video.requestVideoFrameCallback === "function") {
      const requestFrame = () => {
        if (!active) return
        frameCallbackId = video.requestVideoFrameCallback(() => {
          onFrame()
          if (!frameReceived) requestFrame()
        })
      }
      requestFrame()
    }

    video.play().then(() => {
      if (!active) return
      playbackStarted = true
      updateReady()
    }).catch(onPlaybackError)

    return () => {
      active = false
      video.removeEventListener("loadedmetadata", updateReady)
      video.removeEventListener("canplay", onFrame)
      video.removeEventListener("playing", playingHandler)
      video.removeEventListener("error", onPlaybackError)
      tracks.forEach((track) => {
        track.removeEventListener("ended", onTrackEnded)
        track.removeEventListener("mute", onTrackMute)
        track.removeEventListener("unmute", onTrackUnmute)
      })
      if (frameCallbackId !== undefined && typeof video.cancelVideoFrameCallback === "function") {
        video.cancelVideoFrameCallback(frameCallbackId)
      }
      if (video.srcObject === stream) video.srcObject = null
    }
  }, [videoElement, cameraStream, open, still])

  // Release the camera as soon as the dialog closes, and reset for next time.
  useEffect(() => {
    if (open) return
    stopStream()
    setStill((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
    setCameraError(null)
    setSaveError(null)
    setSaving(false)
  }, [open, stopStream])

  useEffect(() => stopStream, [stopStream])

  async function handleCapture() {
    const video = videoRef.current
    const stream = streamRef.current
    const hasLiveTrack = stream?.getVideoTracks().some((track) => track.readyState === "live")
    if (
      !cameraReady || !stream || !hasLiveTrack || !video || video.srcObject !== stream ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      !video.videoWidth || !video.videoHeight
    ) {
      setCameraReady(false)
      setCameraError("The live camera is not ready yet. Wait for the preview, or upload a photo file instead.")
      return
    }

    setSaveError(null)
    try {
      const blob = await normalizePhoto(
        mode,
        video,
        video.videoWidth,
        video.videoHeight
      )
      stopStream()
      setStill({ blob, url: URL.createObjectURL(blob) })
    } catch (err) {
      setSaveError((err as Error).message)
    }
  }

  function handleRetake() {
    setSaveError(null)
    setStill((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
  }

  async function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (fileInputRef.current) fileInputRef.current.value = ""
    if (!file) return

    setSaveError(null)
    const objectUrl = URL.createObjectURL(file)

    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new window.Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error("That file is not a readable image."))
        el.src = objectUrl
      })

      const blob = await normalizePhoto(
        mode,
        img,
        img.naturalWidth,
        img.naturalHeight
      )
      stopStream()
      setStill({ blob, url: URL.createObjectURL(blob) })
    } catch (err) {
      setSaveError((err as Error).message)
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === "vehicle"
              ? "Fit the entire unit inside the portrait guide. The photo is saved as a portrait image with padding as needed."
              : "Position the face inside the guide, then capture. The photo is saved as a portrait ID shot."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative mx-auto aspect-[3/4] w-56 overflow-hidden rounded-md border bg-muted">
            {still ? (
              // Object URL of a just-captured blob — next/image can't optimize it.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={still.url}
                alt="Captured photo preview"
                className={`h-full w-full ${mode === "vehicle" ? "object-contain" : "object-cover"}`}
              />
            ) : (
              <>
                <video
                  ref={attachVideo}
                  autoPlay
                  playsInline
                  muted
                  className={`h-full w-full ${mode === "vehicle" ? "object-contain" : "object-cover"}`}
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
                    <p className="text-xs text-muted-foreground">{cameraError}</p>
                  </div>
                )}
                {(starting || (!cameraReady && !cameraError)) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-muted/70">
                    {starting ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : (
                      <p className="p-3 text-center text-xs text-muted-foreground">Waiting for live camera video…</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {!still && devices.length > 1 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Camera</Label>
              <Select
                value={deviceId ?? devices[0]?.deviceId}
                onValueChange={(value) => setDeviceId(value ?? undefined)}
              >
              <SelectTrigger className="w-full min-w-0 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate">
                  <SelectValue placeholder="Select camera" />
                </SelectTrigger>
                <SelectContent>
                  {devices.map((device, index) => (
                    <SelectItem key={device.deviceId} value={device.deviceId}>
                      <span className="block min-w-0 max-w-full truncate">
                        {cameraLabel(device.label, index)}
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

        <DialogFooter className="gap-2 sm:justify-between">
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
