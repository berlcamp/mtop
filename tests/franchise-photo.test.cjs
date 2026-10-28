/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const typescript = require("typescript")

const source = fs.readFileSync(path.join(__dirname, "../src/lib/franchise-photo.ts"), "utf8")
const compiled = typescript.transpileModule(source, {
  compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2020 },
}).outputText
const loaded = { exports: {} }
new Function("require", "module", "exports", compiled)(require, loaded, loaded.exports)
const { franchisePhotoColumn, isFranchisePhotoUrl } = loaded.exports
const base = "http://127.0.0.1:54321"
const franchise = "a0b1c2d3-e4f5-4678-9abc-def012345678"
const url = (path) => `${base}/storage/v1/object/public/mtop-documents/${path}`

test("all photo slots map to their own persistent franchise column", () => {
  assert.equal(franchisePhotoColumn("owner"), "owner_photo_url")
  assert.equal(franchisePhotoColumn("driver"), "driver_photo_url")
  assert.equal(franchisePhotoColumn("unit"), "unit_photo_url")
  assert.equal(franchisePhotoColumn("card"), null)
})

test("photo URL must be an owned JPEG object for its franchise and slot", () => {
  assert.equal(isFranchisePhotoUrl(url(`photos/${franchise}/mtop_unit_123.jpg`), base, franchise, "unit"), true)
  assert.equal(isFranchisePhotoUrl(url(`photos/${franchise}/mtop_unit_a0b1c2d3-e4f5-4678-9abc-def012345678.jpg`), base, franchise, "unit"), true)
  assert.equal(isFranchisePhotoUrl(url(`photos/other/mtop_unit_123.jpg`), base, franchise, "unit"), false)
  assert.equal(isFranchisePhotoUrl(url(`photos/${franchise}/mtop_driver_123.jpg`), base, franchise, "unit"), false)
  assert.equal(isFranchisePhotoUrl("https://example.com/photo.jpg", base, franchise, "unit"), false)
  assert.equal(isFranchisePhotoUrl("not a url", base, franchise, "unit"), false)
})

test("photo persistence retains verify permission and granted edit restriction", () => {
  const actions = fs.readFileSync(path.join(__dirname, "../src/lib/actions/franchises.ts"), "utf8")
  const action = actions.slice(actions.indexOf("export async function updateFranchisePhoto"), actions.indexOf("export async function updateFranchiseDriverDetails"))
  assert.match(action, /assertCanEditFranchise\(/)
  assert.match(actions, /hasPermission\(supabase, userId, "application\.verify"\)/)
  assert.match(actions, /application\.status === "granted"/)
  assert.match(action, /\.from\("mtop_franchises"\)/)
  assert.match(action, /\.update\(\{ \[column\]: url \}\)/)
})

test("all stored photo slots retain their shared 3:4 frame and Unit upload mode", () => {
  const capture = fs.readFileSync(path.join(__dirname, "../src/components/mtop/photo-capture.tsx"), "utf8")
  const card = fs.readFileSync(path.join(__dirname, "../src/components/mtop/franchise-photos-card.tsx"), "utf8")
  assert.match(capture, /<div className="relative aspect-\[3\/4\] w-32 overflow-hidden rounded-md border bg-muted">/)
  const unit = fs.readFileSync(path.join(__dirname, "../src/components/mtop/unit-photo-slot.tsx"), "utf8")
  assert.match(unit, /<div className="relative aspect-\[3\/4\] w-32 overflow-hidden rounded-md border bg-muted">/)
  assert.match(capture, /<div className="w-32 space-y-2">/)
  assert.match(unit, /return <div className="w-32 space-y-2">/)
  assert.match(card, /<div className="flex flex-wrap gap-8">/)
  assert.match(capture, /mode === "vehicle" \? "object-contain" : "object-cover"/)
  assert.match(card, /<UnitPhotoSlot[\s\S]*?onUpload=/)
  assert.doesNotMatch(capture, /mode === "landscape"/)
  assert.match(capture, /disabled=\{starting \|\| !!cameraError \|\| !cameraReady\}/)
})
