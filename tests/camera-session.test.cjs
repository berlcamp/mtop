/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const ts = require("typescript")

function load(name, timers) {
  const source = fs.readFileSync(path.join(__dirname, `../src/lib/${name}.ts`), "utf8")
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function("require", "module", "exports", "setTimeout", "clearTimeout", compiled)(
    (id) => load(id.slice(2), timers), mod, mod.exports, timers.set, timers.clear
  )
  return mod.exports
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r }); return { promise, resolve } }

function fixture({ acquire, play, enumerate } = {}) {
  const timeouts = new Map()
  let next = 0
  const api = load("camera-session", { set: (cb) => { timeouts.set(++next, cb); return next }, clear: (id) => timeouts.delete(id) })
  const track = Object.assign(new EventTarget(), {
    readyState: "live", enabled: true, muted: false, stops: 0,
    stop() { this.readyState = "ended"; this.stops++ },
    getSettings: () => ({ deviceId: "physical" }),
  })
  const stream = Object.assign(new EventTarget(), { active: true, getTracks: () => [track], getVideoTracks: () => [track] })
  const frames = new Map()
  const video = Object.assign(new EventTarget(), {
    srcObject: null, readyState: 4, videoWidth: 1280, videoHeight: 720, paused: true, ended: false,
    play() { this.paused = false; this.dispatchEvent(new Event("playing")); return play ? play() : Promise.resolve() },
    pause() { this.paused = true },
    requestVideoFrameCallback(cb) { frames.set(++next, cb); return next },
    cancelVideoFrameCallback(id) { frames.delete(id) },
  })
  const devices = [{ kind: "videoinput", deviceId: "physical", label: "USB Webcam" }]
  const requests = []
  const media = Object.assign(new EventTarget(), {
    getUserMedia: (constraints) => { requests.push(constraints); return acquire ? acquire() : Promise.resolve(stream) },
    enumerateDevices: () => enumerate ? enumerate() : Promise.resolve(devices),
  })
  const states = [], selected = [], listed = []
  const start = (deviceId) => api.startCameraPreview(video, media, {
    deviceId, onState: (s) => states.push(s), onDevices: (d) => listed.push(d), onSelectedDevice: (id) => selected.push(id),
  })
  return { ...api, track, stream, video, frames, media, devices, requests, states, selected, listed, start, timeouts,
    frame() { const [id, cb] = frames.entries().next().value; frames.delete(id); cb() },
    expire() { const callbacks = [...timeouts.values()]; timeouts.clear(); callbacks.forEach((cb) => cb()) },
  }
}

test("mounted video receives stream and explicit playback; capture waits for decoded frame", async () => {
  const f = fixture(), session = f.start()
  assert.equal(f.states.at(-1).status, "starting")
  await flush()
  assert.equal(f.video.srcObject, f.stream)
  assert.equal(f.video.paused, false)
  assert.notEqual(f.states.at(-1).status, "ready")
  f.frame()
  assert.equal(f.states.at(-1).status, "ready")
  assert.deepEqual(f.selected, ["physical"])
  session.stop()
  assert.equal(f.video.srcObject, null)
  assert.equal(f.track.stops, 1)
  assert.equal(f.frames.size + f.timeouts.size, 0)
  session.stop()
  assert.equal(f.track.stops, 1)
})

test("switching camera stops old ownership and uses exact new device ID", async () => {
  const f = fixture(), first = f.start()
  await flush()
  first.stop()
  f.track.readyState = "live"
  const second = f.start("physical")
  await flush()
  assert.equal(f.requests[1].video.deviceId.exact, "physical")
  assert.equal(f.track.stops, 1)
  second.stop()
})

test("late acquisition after close/unmount cannot attach or leak tracks", async () => {
  const pending = deferred(), f = fixture({ acquire: () => pending.promise }), session = f.start()
  session.stop()
  pending.resolve(f.stream)
  await flush()
  assert.equal(f.video.srcObject, null)
  assert.equal(f.track.stops, 1)
  assert.equal(f.states.length, 1)
})

test("late old request cannot replace the current stream during switching", async () => {
  const pending = deferred(), oldCamera = fixture()
  let requests = 0
  const f = fixture({ acquire: () => ++requests === 1 ? pending.promise : Promise.resolve(f.stream) })
  const first = f.start("old")
  first.stop()
  const second = f.start("physical")
  await flush()
  assert.equal(f.video.srcObject, f.stream)
  pending.resolve(oldCamera.stream)
  await flush()
  assert.equal(f.video.srcObject, f.stream)
  assert.equal(oldCamera.track.stops, 1)
  assert.equal(f.track.stops, 0)
  second.stop()
})

test("play rejection becomes actionable error and releases camera", async () => {
  const f = fixture({ play: () => Promise.reject(new Error("blocked")) })
  f.start(); await flush()
  assert.equal(f.states.at(-1).status, "error")
  assert.match(f.states.at(-1).error, /could not play.*upload/i)
  assert.equal(f.track.stops, 1)
})

for (const event of ["ended", "inactive", "devicechange"]) {
  test(`camera ${event} disables capture, reports failure, and cleans up`, async () => {
    const f = fixture(); f.start(); await flush(); f.frame()
    if (event === "devicechange") { f.devices.length = 0; f.media.dispatchEvent(new Event(event)) }
    else (event === "ended" ? f.track : f.stream).dispatchEvent(new Event(event))
    await flush()
    assert.equal(f.states.at(-1).status, "error")
    assert.equal(f.track.stops, 1)
    assert.equal(f.video.srcObject, null)
  })
}

test("mute/pause and stalled frames disable readiness and time out", async () => {
  const f = fixture(); f.start(); await flush(); f.frame()
  f.track.muted = true; f.track.dispatchEvent(new Event("mute"))
  assert.equal(f.states.at(-1).status, "waiting")
  f.track.muted = false; f.track.dispatchEvent(new Event("unmute"))
  assert.equal(f.states.at(-1).status, "waiting")
  f.frame()
  assert.equal(f.states.at(-1).status, "ready")
  f.video.paused = true; f.video.dispatchEvent(new Event("pause"))
  assert.equal(f.states.at(-1).status, "waiting")
  f.expire()
  assert.match(f.states.at(-1).error, /No live camera frames/)
  assert.equal(f.track.stops, 1)
})

test("permission prompt timeout releases any eventual stream", async () => {
  const pending = deferred(), f = fixture({ acquire: () => pending.promise })
  f.start(); f.expire()
  assert.equal(f.states.at(-1).status, "error")
  pending.resolve(f.stream); await flush()
  assert.equal(f.track.stops, 1)
  assert.equal(f.video.srcObject, null)
})

test("a stream that stops delivering frames times out after it was ready", async () => {
  const f = fixture(); f.start(); await flush(); f.frame()
  assert.equal(f.states.at(-1).status, "ready")
  f.expire()
  assert.equal(f.states.at(-1).status, "error")
  assert.equal(f.track.stops, 1)
})

test("timeupdate fallback requires playback and current data without frame callbacks", async () => {
  const f = fixture()
  delete f.video.requestVideoFrameCallback
  const session = f.start()
  await flush()
  assert.notEqual(f.states.at(-1).status, "ready")
  f.video.dispatchEvent(new Event("timeupdate"))
  assert.equal(f.states.at(-1).status, "ready")
  session.stop()
})

test("enumeration failure does not discard a working camera", async () => {
  const f = fixture({ enumerate: () => Promise.reject(new Error("enumeration blocked")) }), session = f.start()
  await flush(); f.frame()
  assert.equal(f.states.at(-1).status, "ready")
  session.stop()
})

test("permission, unavailable camera and busy device errors are actionable", async () => {
  for (const name of ["NotAllowedError", "SecurityError", "NotFoundError", "OverconstrainedError", "NotReadableError", "AbortError", "OtherError"]) {
    const f = fixture({ acquire: () => Promise.reject({ name }) })
    f.start(); await flush()
    assert.equal(f.states.at(-1).status, "error")
    assert.match(f.states.at(-1).error, /upload/i)
  }
})

test("camera labels never use raw IDs and bound long human-readable labels", () => {
  const { cameraLabel } = fixture()
  assert.equal(cameraLabel("", 0), "Camera 1")
  assert.equal(cameraLabel("  ", 1), "Camera 2")
  assert.equal(cameraLabel("a".repeat(64), 2), "Camera 3")
  assert.equal(cameraLabel("raw-device-id", 3, "raw-device-id"), "Camera 4")
  assert.equal(cameraLabel(" USB Webcam ", 0), "USB Webcam")
  assert.ok(cameraLabel("Camera name ".repeat(20), 0).length <= 48)
})
