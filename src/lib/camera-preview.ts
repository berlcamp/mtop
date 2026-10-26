/**
 * A camera stream is not ready for capture until it is attached, playing,
 * producing a decoded frame, and backed by a live video track.
 */
export function isCameraPreviewReady(
  video: Pick<HTMLVideoElement, "srcObject" | "readyState" | "videoWidth" | "videoHeight">,
  stream: Pick<MediaStream, "getVideoTracks"> | null,
  playbackStarted: boolean,
  frameReceived: boolean
): boolean {
  return Boolean(
    stream &&
      playbackStarted &&
      frameReceived &&
      stream.getVideoTracks().some((track) => track.readyState === "live" && track.muted !== true) &&
      video.srcObject === stream &&
      video.readyState >= 2 &&
      video.videoWidth > 0 &&
      video.videoHeight > 0
  )
}
