/* eslint @typescript-eslint/no-require-imports: "off" */
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const ts = require("typescript")
const Module = require("node:module")

const source = fs.readFileSync("src/lib/utils/plate-expiration.ts", "utf8")
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const loaded = new Module("date-validation", module)
loaded._compile(js, "date-validation.cjs")
const { parseDateOnly, isLaterDateOnly, grantDateLabel } = loaded.exports

test("manual issuance and expiration accept independent historical calendar dates", () => {
  for (const value of ["1900-01-01", "1945-02-28", "2024-02-29", "9999-12-31"]) {
    assert.ok(parseDateOnly(value), value)
  }
  for (const value of ["", "2023-02-29", "2024-04-31", "2024-00-01", "2024-1-01", "2024-01-01T00:00:00Z"]) {
    assert.equal(parseDateOnly(value), null, value)
  }
})

test("expiration must be strictly later for validity-changing grants", () => {
  const cases = [
    ["2026-10-28", "2026-10-27", false],
    ["2026-10-28", "2026-10-28", false],
    ["2026-10-28", "2026-10-29", true],
    ["2026-10-28", "2029-10-28", true],
    ["2023-01-01", "2024-01-01", true],
    ["2028-02-29", "2029-02-28", true],
    ["2028-02-29", "2028-02-28", false],
    ["2024-02-29", "2024-03-01", true],
    ["2026-10-28", "2027-02-29", false],
    ["", "2026-10-29", false],
    ["2026-10-28", "", false],
  ]
  for (const [issued, expires, expected] of cases) {
    assert.equal(isLaterDateOnly(issued, expires), expected, `${issued} / ${expires}`)
  }
  // Changing issuance revalidates the retained expiration value.
  assert.equal(isLaterDateOnly("2026-10-28", "2026-10-29"), true)
  assert.equal(isLaterDateOnly("2026-10-30", "2026-10-29"), false)
})

test("grant date labels are deterministic date-only calendar labels", () => {
  const cases = [
    ["2026-10-28", "Oct 28, 2026"],
    ["2025-01-05", "Jan 5, 2025"],
    ["2028-02-29", "Feb 29, 2028"],
    ["2029-12-31", "Dec 31, 2029"],
    ["2023-01-01", "Jan 1, 2023"],
  ]
  for (const [value, label] of cases) assert.equal(grantDateLabel(value), label)
  assert.equal(grantDateLabel("2023-02-29"), null)
})
