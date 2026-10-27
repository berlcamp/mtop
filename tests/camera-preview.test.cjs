/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const typescript = require("typescript")

const source = fs.readFileSync(path.join(__dirname, "../src/lib/camera-preview.ts"), "utf8")
const compiled = typescript.transpileModule(source, {
  compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2020 },
}).outputText
const loaded = { exports: {} }
new Function("require", "module", "exports", compiled)(require, loaded, loaded.exports)
const { isCameraPreviewReady } = loaded.exports

function cameraFixture(overrides = {}) {
  const track = { readyState: "live" }
  const stream = { getVideoTracks: () => [track] }
  const video = {
    srcObject: stream,
    readyState: 2,
    videoWidth: 640,
    videoHeight: 480,
  }
  return { track, stream, video, ...overrides }
}

test("camera is ready only after stream attachment, playback, decoded frame, and live dimensions", () => {
  const { stream, video } = cameraFixture()
  assert.equal(isCameraPreviewReady(video, stream, true, true), true)
})

test("camera readiness fails closed before playback or decoded frames", () => {
  const { stream, video } = cameraFixture()
  assert.equal(isCameraPreviewReady(video, stream, false, true), false)
  assert.equal(isCameraPreviewReady(video, stream, true, false), false)
})

test("inactive, disabled, muted, paused, or ended media cannot be captured", () => {
  const { track, stream, video } = cameraFixture()
  for (const state of [{ paused: true }, { ended: true }]) {
    assert.equal(isCameraPreviewReady({ ...video, ...state }, stream, true, true), false)
  }
  assert.equal(isCameraPreviewReady(video, { ...stream, active: false }, true, true), false)
  for (const state of [{ muted: true }, { enabled: false }]) {
    Object.assign(track, { muted: false, enabled: true }, state)
    assert.equal(isCameraPreviewReady(video, stream, true, true), false)
  }
})

test("camera readiness fails closed for missing, detached, ended, zero-size, or undecoded video", () => {
  const { track, stream, video } = cameraFixture()
  assert.equal(isCameraPreviewReady(video, null, true, true), false)
  assert.equal(isCameraPreviewReady({ ...video, srcObject: null }, stream, true, true), false)
  track.readyState = "ended"
  assert.equal(isCameraPreviewReady(video, stream, true, true), false)
  track.readyState = "live"
  assert.equal(isCameraPreviewReady({ ...video, videoWidth: 0 }, stream, true, true), false)
  assert.equal(isCameraPreviewReady({ ...video, videoHeight: 0 }, stream, true, true), false)
  assert.equal(isCameraPreviewReady({ ...video, readyState: 1 }, stream, true, true), false)
})
