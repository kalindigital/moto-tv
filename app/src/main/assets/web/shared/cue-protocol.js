// Protocolo das mensagens específicas da sinuca, trafegadas pelo mesmo relay /ws.
// Mantido separado de protocol.js (moto) de propósito: a sinuca não mexe no que
// já está testado da moto. `action` (restart/qr/pause) é compartilhado — aqui só
// o parse o reconhece; para serializar ação, importe de protocol.js.

const JOGOS_VALIDOS = ['moto', 'sinuca']
const TACOS_VALIDOS = ['classico', 'grafite', 'vermelho']
const MESAS_VALIDAS = ['verde', 'azul', 'vinho']

const clamp01 = (v) => Math.max(0, Math.min(1, v))

export function serializePick(game) {
  return JSON.stringify({ t: 'pick', game })
}
// O `id` (opcional) identifica o celular que enviou — usado no modo 2 jogadores.
export function serializeAim(angle, power, id) {
  const m = { t: 'aim', a: angle, p: power }
  if (id) m.id = id
  return JSON.stringify(m)
}
export function serializeShoot(angle, power, id) {
  const m = { t: 'shoot', a: angle, p: power }
  if (id) m.id = id
  return JSON.stringify(m)
}
export function serializePlace(x, y, id) {
  const m = { t: 'place', x, y }
  if (id) m.id = id
  return JSON.stringify(m)
}
export function serializeJoin(id) {
  return JSON.stringify({ t: 'join', id })
}
export function serializeAssign(id, player) {
  return JSON.stringify({ t: 'assign', id, player })
}
export function serializeSinucaSetup(taco, mesa) {
  return JSON.stringify({ t: 'sinucaSetup', taco, mesa })
}
export function serializeTurn(info) {
  const m = {
    t: 'turn',
    player: info.player,
    group: info.group ?? null,
    ballInHand: !!info.ballInHand,
    phase: info.phase,
    winner: info.winner ?? null,
  }
  if (info.controllerId) m.cid = info.controllerId   // celular dono da vez (2 jogadores)
  return JSON.stringify(m)
}

export function parseMessage(str) {
  let m
  try { m = JSON.parse(str) } catch { return { type: 'unknown' } }
  if (!m || typeof m !== 'object') return { type: 'unknown' }

  if (m.t === 'pick' && JOGOS_VALIDOS.includes(m.game)) {
    return { type: 'pick', game: m.game }
  }
  if ((m.t === 'aim' || m.t === 'shoot') && Number.isFinite(m.a) && Number.isFinite(m.p)) {
    const r = { type: m.t, angle: m.a, power: clamp01(m.p) }
    if (typeof m.id === 'string') r.id = m.id
    return r
  }
  if (m.t === 'place' && Number.isFinite(m.x) && Number.isFinite(m.y)) {
    const r = { type: 'place', x: clamp01(m.x), y: clamp01(m.y) }
    if (typeof m.id === 'string') r.id = m.id
    return r
  }
  if (m.t === 'join' && typeof m.id === 'string') {
    return { type: 'join', id: m.id }
  }
  if (m.t === 'assign' && typeof m.id === 'string' && (m.player === 1 || m.player === 2)) {
    return { type: 'assign', id: m.id, player: m.player }
  }
  if (m.t === 'sinucaSetup') {
    return {
      type: 'sinucaSetup',
      taco: TACOS_VALIDOS.includes(m.taco) ? m.taco : 'classico',
      mesa: MESAS_VALIDAS.includes(m.mesa) ? m.mesa : 'verde',
    }
  }
  if (m.t === 'turn' && (m.player === 1 || m.player === 2)) {
    const group = (m.group === 'solid' || m.group === 'stripe') ? m.group : null
    const winner = (m.winner === 1 || m.winner === 2) ? m.winner : null
    const r = {
      type: 'turn',
      player: m.player,
      group,
      ballInHand: !!m.ballInHand,
      phase: typeof m.phase === 'string' ? m.phase : 'playing',
      winner,
    }
    if (typeof m.cid === 'string') r.controllerId = m.cid
    return r
  }
  if (m.t === 'action' && typeof m.name === 'string') {
    return { type: 'action', name: m.name }
  }
  return { type: 'unknown' }
}
