const MAX_BYTES = 20 * 1024 * 1024
const MAX_PIXELS = 40_000_000
const MAX_SIDE = 2400

/** Decode a JPEG, PNG or WebP and save the complete, oriented image as JPEG. */
export async function prepareUnitPhoto(file: File): Promise<Blob> {
  if (!file.size || file.size > MAX_BYTES) throw new Error("Choose an image smaller than 20 MB.")
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  if (!jpeg && !png && !webp) throw new Error("Choose a JPEG, PNG, or WebP image.")

  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode().catch(() => { throw new Error("That file is not a readable image.") })
    const { naturalWidth: width, naturalHeight: height } = image
    if (!width || !height || width * height > MAX_PIXELS) throw new Error("Image dimensions are not supported (maximum 40 megapixels).")
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Image processing is unavailable.")
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Could not process the image.")), "image/jpeg", 0.9
    ))
  } finally {
    URL.revokeObjectURL(url)
  }
}
