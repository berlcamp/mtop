export type PhotoMode = "portrait" | "vehicle"
export const PHOTO_WIDTH = 600
export const PHOTO_HEIGHT = 800

/** Same centered crop as a 3:4 viewport with object-fit: cover. No stretching. */
export function portraitCrop(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("The photo has no usable image dimensions.")
  }
  const aspect = PHOTO_WIDTH / PHOTO_HEIGHT
  const sw = Math.min(width, height * aspect)
  const sh = Math.min(height, width / aspect)
  return { sx: (width - sw) / 2, sy: (height - sh) / 2, sw, sh }
}

export function normalizePhoto(
  source: HTMLVideoElement | HTMLImageElement,
  width: number,
  height: number,
  preserveFullImage = false
): Promise<Blob> {
  const crop = portraitCrop(width, height)
  const canvas = document.createElement("canvas")
  canvas.width = PHOTO_WIDTH
  canvas.height = PHOTO_HEIGHT
  const ctx = canvas.getContext("2d")
  if (!ctx) return Promise.reject(new Error("Canvas is not available."))
  if (preserveFullImage) {
    // Uploaded Unit photos retain their full contents, with neutral padding.
    ctx.fillStyle = "#f4f4f5"
    ctx.fillRect(0, 0, PHOTO_WIDTH, PHOTO_HEIGHT)
    const scale = Math.min(PHOTO_WIDTH / width, PHOTO_HEIGHT / height)
    const dw = width * scale
    const dh = height * scale
    ctx.drawImage(source, (PHOTO_WIDTH - dw) / 2, (PHOTO_HEIGHT - dh) / 2, dw, dh)
  } else {
    ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT)
  }
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("Failed to encode the photo.")),
    "image/jpeg", 0.85
  ))
}
