/* eslint @typescript-eslint/no-require-imports: "off" */
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const ts = require("typescript")
const source = fs.readFileSync("src/lib/unit-photo.ts", "utf8")
const moduleObject = { exports: {} }
new Function("exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(moduleObject.exports)
const { prepareUnitPhoto } = moduleObject.exports

test("Unit image processing rejects spoofed and oversized files", async () => {
  await assert.rejects(prepareUnitPhoto(new File(["not an image"], "photo.jpg", { type: "image/jpeg" })), /JPEG, PNG, or WebP/)
  await assert.rejects(prepareUnitPhoto(new File([new Uint8Array(20 * 1024 * 1024 + 1)], "x.png")), /20 MB/)
})

test("Unit image processing keeps complete proportional dimensions", async () => {
  const previous = { Image: global.Image, document: global.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL }
  let canvas
  global.Image = class { naturalWidth = 4000; naturalHeight = 2000; async decode() {} }
  URL.createObjectURL = () => "blob:test"
  URL.revokeObjectURL = () => {}
  global.document = { createElement: () => (canvas = { getContext: () => ({ fillRect() {}, drawImage(...args) { assert.deepEqual(args.slice(1), [0, 0, 2400, 1200]) } }), toBlob: (callback) => callback(new Blob(["jpg"])) }) }
  try {
    await prepareUnitPhoto(new File([new Uint8Array([255, 216, 255])], "photo.jpg"))
    assert.equal(canvas.width, 2400)
    assert.equal(canvas.height, 1200)
  } finally {
    global.Image = previous.Image; global.document = previous.document
    URL.createObjectURL = previous.create; URL.revokeObjectURL = previous.revoke
  }
})

test("Unit has an independent labeled input and viewer, while camera slots remain", () => {
  const unit = fs.readFileSync("src/components/mtop/unit-photo-slot.tsx", "utf8")
  const card = fs.readFileSync("src/components/mtop/franchise-photos-card.tsx", "utf8")
  assert.match(unit, /<label htmlFor=\{id\}/)
  assert.match(unit, /type="file"/)
  assert.doesNotMatch(unit, /getUserMedia|CameraCaptureDialog|capture=/)
  assert.match(unit, /object-contain/)
  assert.match(unit, /View Unit Photo/)
  assert.equal((card.match(/<PhotoSlot/g) || []).length, 2)
})
