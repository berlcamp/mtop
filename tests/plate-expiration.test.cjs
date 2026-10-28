/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const ts = require("typescript")

const source = fs.readFileSync(path.join(__dirname, "../src/lib/utils/plate-expiration.ts"), "utf8")
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const result = { exports: {} }
new Function("module", "exports", compiled)(result, result.exports)
const { plateExpiration, parseDateOnly } = result.exports

const examples = [
  ["2026-12-31", "ABC-1", "2029-12-31"],
  ["2026-06-01", "ABC-2", "2028-12-31"],
  ["2026-12-31", "ABC-5", "2029-02-28"],
  ["2026-01-01", "ABC-7", "2028-03-31"],
  ["2025-07-01", "ABC-6", "2028-02-29"],
  ["2026-03-31", "ABC-0", "2029-03-31"],
  ["2028-02-29", "ABC-6", "2031-02-28"],
]
test("required examples and plate separators", () => {
  for (const [issued, plate, expected] of examples) assert.equal(plateExpiration(issued, plate), expected)
  assert.equal(plateExpiration("2026-06-01", " AB-12 / X "), null)
  assert.equal(plateExpiration("2026-06-01", " AB-12 / 3 "), "2028-12-31")
})

test("all digits, all issuance months, leap and nonleap years stay within inclusive calendar bounds", () => {
  let checked = 0
  for (const year of [2024, 2025, 2026, 2028, 2100, 2400]) {
    for (let month = 1; month <= 12; month++) {
      for (const day of [1, 15, 28, 29, 30, 31]) {
        const issued = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
        if (!parseDateOnly(issued)) continue
        for (let digit = 0; digit <= 9; digit++) {
          const expiration = plateExpiration(issued, `ABC-${digit}`)
          assert.ok(expiration, `${issued} ${digit}`)
          const anniversary = (offset) => {
            const targetYear = year + offset
            const clamp = month === 2 && day === 29 && !parseDateOnly(`${targetYear}-02-29`) ? 28 : day
            return `${targetYear}-${String(month).padStart(2, "0")}-${String(clamp).padStart(2, "0")}`
          }
          assert.ok(expiration >= anniversary(2), `${issued} ${digit} minimum`)
          assert.ok(expiration <= anniversary(3), `${issued} ${digit} maximum`)
          assert.equal(Number(expiration.slice(5, 7)), [0, 7, 8, 9].includes(digit) ? 3 : digit <= 3 ? 12 : 2)
          const end = expiration.slice(5) === "02-29" ? 29 : Number(expiration.slice(5, 7)) === 2 ? 28 : 31
          assert.equal(Number(expiration.slice(8)), end)
          checked++
        }
      }
    }
  }
  assert.ok(checked > 3000)
})

test("exact two and three years, invalid dates, and invalid plates", () => {
  assert.equal(plateExpiration("2026-12-31", "A1"), "2029-12-31")
  assert.equal(plateExpiration("2026-03-31", "A0"), "2029-03-31")
  assert.equal(plateExpiration("2028-02-29", "A6"), "2031-02-28")
  for (const date of ["", "2026-02-29", "2025-04-31", "2026-13-01", "2026-1-01", "2026-03-01T00:00:00Z"]) {
    assert.equal(plateExpiration(date, "A1"), null)
  }
  for (const plate of [null, "", "ABC", "A12X", "---"]) assert.equal(plateExpiration("2026-01-01", plate), null)
})

test("date-only results do not depend on the process timezone", () => {
  const previous = process.env.TZ
  try {
    for (const zone of ["UTC", "Asia/Manila", "America/Los_Angeles", "Pacific/Auckland"]) {
      process.env.TZ = zone
      assert.equal(plateExpiration("2028-02-29", "ABC-6"), "2031-02-28")
      assert.equal(plateExpiration("2026-12-31", "ABC-1"), "2029-12-31")
    }
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
})
