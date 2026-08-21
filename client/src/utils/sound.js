// All sound effects are synthesized live with the Web Audio API — no external
// audio files, so there's no licensing question and the whole app stays
// runnable completely offline from the zip.
let ctx = null
function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function tone(freq, startTime, duration, { type = 'sine', gain = 0.18 } = {}) {
  const c = getCtx()
  if (!c) return
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, startTime)
  g.gain.setValueAtTime(0, startTime)
  g.gain.linearRampToValueAtTime(gain, startTime + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
  osc.connect(g).connect(c.destination)
  osc.start(startTime)
  osc.stop(startTime + duration + 0.05)
}

/** Cheerful little rising chime played when the deer greets the user on load. */
export function playGreeting() {
  const c = getCtx()
  if (!c) return
  const t = c.currentTime
  ;[523.25, 659.25, 784.0].forEach((f, i) => tone(f, t + i * 0.11, 0.25, { type: 'triangle' }))
}

/** Soft footstep tick — call on each animation step while the deer is walking. */
export function playFootstep() {
  const c = getCtx()
  if (!c) return
  tone(180 + Math.random() * 30, c.currentTime, 0.08, { type: 'square', gain: 0.05 })
}

/** Notification "ping" played just before the arrival photo pops up. */
export function playArrivalPing() {
  const c = getCtx()
  if (!c) return
  const t = c.currentTime
  tone(880, t, 0.18, { type: 'sine', gain: 0.2 })
  tone(1318.5, t + 0.14, 0.3, { type: 'sine', gain: 0.18 })
}

/** Short click for general UI confirmation (e.g. admin save). */
export function playClick() {
  const c = getCtx()
  if (!c) return
  tone(440, c.currentTime, 0.06, { type: 'square', gain: 0.08 })
}
