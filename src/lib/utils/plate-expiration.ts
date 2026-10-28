/** Calendar-only permit terms. February 29 anniversaries clamp to February 28. */
export function parseDateOnly(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  if (year < 1 || year > 9996 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null
  return { year, month, day }
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

function dateOnly(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export function plateExpiration(dateIssued: string, plateNumber: string | null | undefined): string | null {
  const issued = parseDateOnly(dateIssued)
  // Match the stored identifier's existing normalization: remove punctuation,
  // uppercase, and require its final alphanumeric character to be a digit.
  const normalized = plateNumber?.toUpperCase().replace(/[^\p{L}\p{N}]/gu, "") ?? ""
  const digit = /[0-9]$/.exec(normalized)?.[0]
  if (!issued || digit === undefined) return null
  const month = "123".includes(digit) ? 12 : "456".includes(digit) ? 2 : 3
  const lowerYear = issued.year + 2, upperYear = issued.year + 3
  const lower = dateOnly(lowerYear, issued.month, Math.min(issued.day, daysInMonth(lowerYear, issued.month)))
  const upper = dateOnly(upperYear, issued.month, Math.min(issued.day, daysInMonth(upperYear, issued.month)))
  for (let year = upperYear; year >= lowerYear; year--) {
    const candidate = dateOnly(year, month, daysInMonth(year, month))
    if (candidate >= lower && candidate <= upper) return candidate
  }
  return null
}
