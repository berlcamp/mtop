/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const ts = require("typescript")
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/lib/photo-normalization.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const mod = { exports: {} }, draws = [], fills = []
const ctx = { drawImage: (...args) => draws.push(args), fillRect: (...args) => fills.push(args) }
const canvas = { getContext: () => ctx, toBlob: (cb, type) => cb(new Blob(["jpeg"], { type })) }
new Function("module", "exports", "document", code)(mod, mod.exports, { createElement: () => canvas })
const { portraitCrop, normalizePhoto } = mod.exports

test("landscape camera is center-cropped exactly like portrait object-cover", () => {
  assert.deepEqual(portraitCrop(1280, 720), { sx: 370, sy: 0, sw: 540, sh: 720 })
  assert.deepEqual(portraitCrop(600, 800), { sx: 0, sy: 0, sw: 600, sh: 800 })
  assert.deepEqual(portraitCrop(600, 1200), { sx: 0, sy: 200, sw: 600, sh: 800 })
})

test("zero or invalid dimensions fail before canvas capture", () => {
  for (const [w, h] of [[0, 720], [1280, 0], [-1, 10], [Infinity, 10], [NaN, 10]]) {
    assert.throws(() => portraitCrop(w, h), /dimensions/)
  }
})

test("live Unit and Owner/Driver capture all encode proportional 600x800 JPEGs", async () => {
  const source = {}
  const blob = await normalizePhoto(source, 1280, 720)
  assert.deepEqual(draws.at(-1), [source, 370, 0, 540, 720, 0, 0, 600, 800])
  assert.equal(canvas.width, 600)
  assert.equal(canvas.height, 800)
  assert.equal(blob.type, "image/jpeg")
})

test("uploaded Unit landscape retains entire image with neutral padding", async () => {
  const source = {}
  await normalizePhoto(source, 1200, 800, true)
  assert.deepEqual(draws.at(-1), [source, 0, 200, 600, 400])
  assert.deepEqual(fills.at(-1), [0, 0, 600, 800])
  assert.equal(ctx.fillStyle, "#f4f4f5")
})
