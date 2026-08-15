export function serializeSteer(value) {
  return JSON.stringify({ t: 'steer', v: value })
}
export function serializeAction(name) {
  return JSON.stringify({ t: 'action', name })
}
export function serializeThrottle(ativo) {
  return JSON.stringify({ t: 'throttle', v: ativo })
}
// Motos disponíveis: 'sk' (Esportiva), 'kawasaki' (Ninja), 'classica' (procedural).
const MOTOS_VALIDAS = ['sk', 'kawasaki', 'classica']

export function serializeSetup(periodo, moto) {
  // A moto é opcional: sem ela (ou com id desconhecido) mantemos o formato antigo.
  if (!MOTOS_VALIDAS.includes(moto)) return JSON.stringify({ t: 'setup', periodo })
  return JSON.stringify({ t: 'setup', periodo, moto })
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
  if (m && m.t === 'throttle' && typeof m.v === 'boolean') {
    return { type: 'throttle', ativo: m.v }
  }
  // Só 'dia' e 'noite' são períodos válidos; o resto cai em unknown.
  if (m && m.t === 'setup' && (m.periodo === 'dia' || m.periodo === 'noite')) {
    // A moto é opcional: ausente ou desconhecida vira null (o jogo usa a padrão).
    const moto = MOTOS_VALIDAS.includes(m.moto) ? m.moto : null
    return { type: 'setup', periodo: m.periodo, moto }
  }
  return { type: 'unknown' }
}
