// Protocolo das mensagens específicas da sinuca, trafegadas pelo mesmo relay /ws.
// Mantido separado de protocol.js (moto) de propósito: a sinuca não mexe no que
// já está testado da moto. `action` (restart/qr/pause) é compartilhado — aqui só
// o parse o reconhece; para serializar ação, importe de protocol.js.

const JOGOS_VALIDOS = ['moto', 'sinuca']
const TACOS_VALIDOS = ['classico', 'grafite', 'vermelho']
const MESAS_VALIDAS = ['verde', 'azul', 'vinho']
const MODOS_VALIDOS = ['solo', 'multi']
const DIFICULDADES_VALIDAS = ['facil', 'medio', 'dificil']

const clamp01 = (v) => Math.max(0, Math.min(1, v))

// Quem escolhe o jogo assume a vaga do Jogador 1 — por isso o pick leva o id.
export function serializePick(game, id) {
  const m = { t: 'pick', game }
  if (id) m.id = id
  return JSON.stringify(m)
}
// O `id` (opcional) identifica o celular que enviou — usado no modo 2 jogadores.
// `efeito` (opcional) é onde o taco bate na branca: x lateral, y vertical, -1..1.
function comEfeito(m, id, efeito) {
  if (id) m.id = id
  if (efeito && (efeito.x || efeito.y)) { m.sx = efeito.x; m.sy = efeito.y }
  return JSON.stringify(m)
}
export function serializeAim(angle, power, id, efeito) {
  return comEfeito({ t: 'aim', a: angle, p: power }, id, efeito)
}
export function serializeShoot(angle, power, id, efeito) {
  return comEfeito({ t: 'shoot', a: angle, p: power }, id, efeito)
}
export function serializePlace(x, y, id) {
  const m = { t: 'place', x, y }
  if (id) m.id = id
  return JSON.stringify(m)
}
export function serializeJoin(id) {
  return JSON.stringify({ t: 'join', id })
}
// Modo da partida: 'solo' (contra a máquina) ou 'multi' (dois celulares).
// A dificuldade só interessa ao solo, mas viaja sempre para simplificar.
export function serializeMode(mode, dificuldade) {
  return JSON.stringify({ t: 'mode', mode, dif: DIFICULDADES_VALIDAS.includes(dificuldade) ? dificuldade : 'medio' })
}
export function serializeAssign(id, player) {
  return JSON.stringify({ t: 'assign', id, player })
}
// Impacto na mesa (TV → celular): serve para o celular vibrar junto da tacada.
export function serializeHit(intensidade) {
  return JSON.stringify({ t: 'hit', p: intensidade })
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
    const r = { type: 'pick', game: m.game }
    if (typeof m.id === 'string') r.id = m.id
    return r
  }
  if ((m.t === 'aim' || m.t === 'shoot') && Number.isFinite(m.a) && Number.isFinite(m.p)) {
    const r = { type: m.t, angle: m.a, power: clamp01(m.p) }
    if (typeof m.id === 'string') r.id = m.id
    if (Number.isFinite(m.sx) || Number.isFinite(m.sy)) {
      const eixo = (v) => Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0))
      r.efeito = { x: eixo(m.sx), y: eixo(m.sy) }
    }
    return r
  }
  if (m.t === 'place' && Number.isFinite(m.x) && Number.isFinite(m.y)) {
    const r = { type: 'place', x: clamp01(m.x), y: clamp01(m.y) }
    if (typeof m.id === 'string') r.id = m.id
    return r
  }
  if (m.t === 'hit' && Number.isFinite(m.p)) {
    return { type: 'hit', power: clamp01(m.p) }
  }
  if (m.t === 'mode' && MODOS_VALIDOS.includes(m.mode)) {
    return {
      type: 'mode',
      mode: m.mode,
      dificuldade: DIFICULDADES_VALIDAS.includes(m.dif) ? m.dif : 'medio',
    }
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
