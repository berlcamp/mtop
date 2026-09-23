/**
 * Dates as the office reckons them.
 *
 * The database stores timestamps in UTC and the server runs in UTC, but the
 * counter is in Ozamiz — eight hours ahead. Read naively, a permit granted at
 * 7am on the 13th was granted "on the 12th", and one granted in the small
 * hours of 1 January belongs to the year that just ended. That is how an MTOP
 * number, a validity date and the date typed on a confirmation slip can each
 * be a day or a year out, all from the same slip of eight hours.
 *
 * Mirrors mtop.grant_date() / mtop.grant_year() in
 * 20260413000026_mtop_number_grant_year.sql, which do the same for the number
 * itself. If you change one side, change the other.
 */

export const OFFICE_TIME_ZONE = "Asia/Manila"

/** "2026-03-27" — a DATE column, already a calendar day with no zone to it. */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

export interface OfficeDate {
  year: number
  /** 1-12, not the 0-11 a JS Date would hand back. */
  month: number
  day: number
}

/**
 * The calendar day a stored value falls on in Ozamiz.
 *
 * A plain date is taken at face value — a DATE column carries no time and so
 * no zone to convert from; anything else is a timestamp and is converted.
 */
export function officeDateParts(
  value: string | null | undefined
): OfficeDate | null {
  if (!value) return null

  const plain = DATE_ONLY.exec(value.trim())
  if (plain) {
    return { year: +plain[1], month: +plain[2], day: +plain[3] }
  }

  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return null

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OFFICE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at)

  const read = (type: "year" | "month" | "day") =>
    Number(parts.find((p) => p.type === type)?.value)

  const year = read("year")
  const month = read("month")
  const day = read("day")
  if (!year || !month || !day) return null

  return { year, month, day }
}

/** The year an MTOP granted at this instant belongs to. */
export function officeYear(value: string | null | undefined): number | null {
  return officeDateParts(value)?.year ?? null
}

/**
 * A stored timestamp as a short readable day in Ozamiz — "Sep 23, 2026".
 *
 * Formatting through Intl with an explicit zone rather than the runtime's own
 * means the server and the browser produce the same string: the server runs in
 * UTC, so `toLocaleDateString()` alone renders one day on the server and
 * another in the office, which React reports as a hydration mismatch.
 */
export function officeDateLabel(
  value: string | null | undefined
): string | null {
  const parts = officeDateParts(value)
  if (!parts) return null

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(Date.UTC(parts.year, parts.month - 1, parts.day))
}
