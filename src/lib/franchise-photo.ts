export type FranchisePhotoSlot = "owner" | "driver" | "unit"

export function franchisePhotoColumn(slot: unknown): string | null {
  if (slot === "owner") return "owner_photo_url"
  if (slot === "driver") return "driver_photo_url"
  if (slot === "unit") return "unit_photo_url"
  return null
}

export function isFranchisePhotoUrl(
  value: unknown,
  supabaseUrl: string | undefined,
  franchiseId: string,
  slot: FranchisePhotoSlot
): value is string {
  if (typeof value !== "string" || !supabaseUrl) return false
  try {
    const parsed = new URL(value)
    const marker = "/storage/v1/object/public/mtop-documents/"
    const index = parsed.pathname.indexOf(marker)
    if (index < 0 || parsed.origin !== new URL(supabaseUrl).origin) return false
    const objectPath = decodeURIComponent(parsed.pathname.slice(index + marker.length))
    return new RegExp(
      `^photos/${franchiseId}/mtop_${slot}_(?:[0-9]+|[0-9a-f-]{36})\\.jpg$`,
      "i"
    ).test(objectPath)
  } catch {
    return false
  }
}
