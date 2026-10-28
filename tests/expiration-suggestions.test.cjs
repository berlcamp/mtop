/* eslint @typescript-eslint/no-require-imports: "off" */
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const ts = require("typescript")

const source = fs.readFileSync("src/lib/utils/plate-expiration.ts", "utf8")
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const moduleObject = { exports: {} }
new Function("module", "exports", compiled)(moduleObject, moduleObject.exports)
const { suggestNewFranchiseExpiration: newFranchise, suggestRenewalExpiration: renewal, selectedGrantExpiration: selected, isLaterDateOnly } = moduleObject.exports

test("new franchise selects the first assigned month end after the third anniversary", () => {
  for (const [issued, digit, expected] of [
    ["2026-12-01", "3", "2029-12-31"],
    ["2026-12-01", "9", "2030-03-31"],
    ["2027-02-01", "9", "2030-03-31"],
    ["2026-03-31", "9", "2029-03-31"],
    ["2026-12-01", "5", "2030-02-28"],
    ["2025-01-01", "6", "2028-02-29"],
  ]) assert.equal(newFranchise(issued, `ABC-${digit}`), expected)
  for (const digit of "1234567890") {
    const month = "123".includes(digit) ? "12-31" : "456".includes(digit) ? "02-28" : "03-31"
    assert.equal(newFranchise("2026-01-01", `ABC-${digit}`), `2029-${month}`)
  }
})

test("invalid inputs cannot produce suggestions", () => {
  for (const plate of [null, "", "ABC", "ABC-1X"]) assert.equal(newFranchise("2026-01-01", plate), null)
  for (const issued of ["", "2026-02-30", "2026-1-01", "9999-01-01"]) assert.equal(newFranchise(issued, "ABC-1"), null)
})

test("renewal preserves the previous expiration month and adjusts to its final day", () => {
  for (const [previous, expected] of [
    ["2030-03-31", "2033-03-31"], ["2029-12-31", "2032-12-31"],
    ["2029-02-28", "2032-02-29"], ["2030-02-28", "2033-02-28"],
    ["2032-02-29", "2035-02-28"], ["2028-06-30", "2031-06-30"],
  ]) assert.equal(renewal(previous), expected)
  for (const previous of [null, "", "2029-02-29", "9997-01-31"]) assert.equal(renewal(previous), null)
})

test("manual expiration choices remain valid independent of the suggested term", () => {
  assert.equal(newFranchise("2026-12-01", "ABC-9"), "2030-03-31")
  assert.equal(isLaterDateOnly("2026-12-01", "2029-12-31"), true)
  assert.equal(isLaterDateOnly("2030-01-01", "2029-12-31"), false)
})

test("selection lifecycle preserves overrides and submits the visible value", () => {
  const choose = (issued, manual = null) => selected("issue_number", issued, "ABC-9", null, manual)
  assert.equal(choose(""), "")
  assert.equal(choose("2026-12-01"), "2030-03-31")
  assert.equal(choose("2027-04-01"), "2031-03-31")
  assert.equal(choose("2026-12-01", "2029-12-31"), "2029-12-31")
  assert.equal(choose("2027-04-01", "2029-12-31"), "2029-12-31")
  assert.equal(choose("2026-12-01", ""), "")
  assert.equal(choose("2026-12-01", null), "2030-03-31") // remounted dialog
  assert.equal(isLaterDateOnly("2030-01-01", choose("2030-01-01", "2029-12-31")), false)
  assert.equal(selected("extend_validity", "2030-01-01", "ABC-9", "2030-03-31", null), "2033-03-31")
  assert.equal(selected("extend_validity", "2034-01-01", "ABC-9", "2030-03-31", null), "")
  assert.equal(selected("extend_validity", "2030-01-01", null, null, null), "")
  for (const effect of ["replace_unit", "transfer_owner", "annual_confirmation", "reissue", "closure"]) {
    assert.equal(selected(effect, "2026-12-01", "ABC-9", "2030-03-31", null), "")
  }
})
