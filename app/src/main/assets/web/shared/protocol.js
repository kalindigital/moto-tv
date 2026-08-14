export function serializeSteer(value) {
  return JSON.stringify({ t: 'steer', v: value })
}
export function serializeAction(name) {
  return JSON.stringify({ t: 'action', name })
}
export function parseMessage(str) {
  let m
  try { m = JSON.parse(str) } catch { return { type: 'unknown' } }
  if (m && m.t === 'steer' && typeof m.v === 'number') {
    return { type: 'steer', value: Math.max(-1, Math.min(1, m.v)) }
  }
  if (m && m.t === 'action' && typeof m.name === 'string') {
    return { type: 'action', name: m.name }
  }
  return { type: 'unknown' }
}
