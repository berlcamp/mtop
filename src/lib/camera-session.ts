import { isCameraPreviewReady } from "./camera-preview"

export function cameraLabel(label: string, index: number, deviceId = ""): string {
  const text = label.trim()
  const readable = !text || text === deviceId || /^[a-f0-9-]{32,}$/i.test(text)
    ? `Camera ${index + 1}` : text
  return readable.length > 48 ? `${readable.slice(0, 45)}…` : readable
}

export function describeCameraError(error: unknown): string {
  switch ((error as { name?: string })?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera access was blocked. Allow camera access in your browser and Windows camera settings, or upload a photo instead."
    case "NotFoundError":
    case "OverconstrainedError":
      return "The selected camera is unavailable. Select another camera, reconnect it and retry, or upload a photo instead."
    case "NotReadableError":
    case "AbortError":
      return "The camera could not start. Close other apps using it, check its connection and retry, or upload a photo instead."
    default:
      return "The camera could not be started. Check its connection and browser permissions, retry, or upload a photo instead."
  }
}

export type CameraState = { status: "starting" | "waiting" | "ready" | "error"; error?: string }
export const CAMERA_TIMEOUT_MS = 12000

/** Owns one acquisition/playback attempt. Cleanup also disposes late permission results. */
export function startCameraPreview(
  video: HTMLVideoElement,
  media: MediaDevices,
  options: {
    deviceId?: string
    onState: (state: CameraState) => void
    onDevices: (devices: MediaDeviceInfo[]) => void
    onSelectedDevice: (id: string) => void
  }
) {
  let disposed = false
  let stream: MediaStream | null = null
  let playbackStarted = false
  let frameReceived = false
  let frameId: number | undefined
  let deadline: ReturnType<typeof setTimeout> | undefined
  const removeListeners: (() => void)[] = []
  const supportsFrames = typeof video.requestVideoFrameCallback === "function"

  function listen(target: EventTarget, event: string, handler: () => void) {
    target.addEventListener(event, handler)
    removeListeners.push(() => target.removeEventListener(event, handler))
  }
  function stop() {
    if (disposed) return
    disposed = true
    clearTimeout(deadline)
    removeListeners.forEach((remove) => remove())
    if (frameId !== undefined) video.cancelVideoFrameCallback?.(frameId)
    stream?.getTracks().forEach((track) => track.stop())
    if (stream && video.srcObject === stream) {
      video.pause()
      video.srcObject = null
    }
    stream = null
  }
  function fail(error: string) {
    if (disposed) return
    stop()
    options.onState({ status: "error", error })
  }
  function armDeadline() {
    clearTimeout(deadline)
    deadline = setTimeout(() => fail(
      "No live camera frames arrived in time. Check the selected camera and its connection, retry, or upload a photo instead."
    ), CAMERA_TIMEOUT_MS)
  }
  let wasReady = false
  function updateReady() {
    if (disposed) return
    const ready = isCameraPreviewReady(video, stream, playbackStarted, frameReceived)
    if (ready !== wasReady) {
      wasReady = ready
      options.onState({ status: ready ? "ready" : "waiting" })
    }
  }
  function onFrame() {
    if (disposed) return
    frameReceived = true
    armDeadline()
    updateReady()
    if (supportsFrames) frameId = video.requestVideoFrameCallback(onFrame)
  }
  async function refreshDevices() {
    try {
      const devices = (await media.enumerateDevices()).filter((device) => device.kind === "videoinput")
      if (disposed) return
      options.onDevices(devices)
      const id = stream?.getVideoTracks()[0]?.getSettings().deviceId
      if (id && !devices.some((device) => device.deviceId === id)) {
        fail("The camera was disconnected. Reconnect it and retry, select another camera, or upload a photo instead.")
      }
    } catch {
      // Enumeration can fail independently; it must not disable a working stream.
    }
  }

  options.onState({ status: "starting" })
  // Offer other devices even if the default camera fails to open. Enumeration
  // before permission can return blank labels; cameraLabel supplies safe names.
  void refreshDevices()
  armDeadline()
  void (async () => {
    try {
      const acquired = await media.getUserMedia({
        video: {
          ...(options.deviceId ? { deviceId: { exact: options.deviceId } } : {}),
          width: { ideal: 1280 }, height: { ideal: 960 },
        },
        audio: false,
      })
      if (disposed) {
        acquired.getTracks().forEach((track) => track.stop())
        return
      }
      stream = acquired
      const tracks = stream.getVideoTracks()
      if (!tracks.length || stream.active === false) {
        fail("The camera returned no active video. Select another camera, retry, or upload a photo instead.")
        return
      }
      const id = tracks[0].getSettings().deviceId
      if (id) options.onSelectedDevice(id)
      listen(video, "loadedmetadata", updateReady)
      listen(video, "playing", () => { playbackStarted = true; updateReady() })
      if (!supportsFrames) listen(video, "timeupdate", onFrame)
      for (const event of ["waiting", "stalled", "pause", "emptied"]) {
        listen(video, event, () => {
          playbackStarted = false
          frameReceived = false
          updateReady()
          armDeadline()
        })
      }
      listen(video, "error", () => fail("The camera preview could not play. Retry or upload a photo instead."))
      listen(stream, "inactive", () => fail("The camera stream stopped. Reconnect it and retry, or upload a photo instead."))
      tracks.forEach((track) => {
        listen(track, "ended", () => fail("The camera disconnected or stopped. Reconnect it and retry, or upload a photo instead."))
        listen(track, "mute", () => { frameReceived = false; updateReady(); armDeadline() })
        listen(track, "unmute", updateReady)
      })
      listen(media, "devicechange", () => { void refreshDevices() })
      video.muted = true
      video.playsInline = true
      video.srcObject = stream
      if (supportsFrames) frameId = video.requestVideoFrameCallback(onFrame)
      void refreshDevices()
      try {
        await video.play()
        if (!disposed) { playbackStarted = true; updateReady() }
      } catch {
        fail("The camera preview could not play. Retry, check browser playback permissions, or upload a photo instead.")
      }
    } catch (error) {
      fail(describeCameraError(error))
    }
  })()
  return { stop, getStream: () => stream }
}
