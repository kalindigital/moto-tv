// Máquina de estados pura do 8-ball (bola 8), sem nada de render/rede.
// O motor do jogo simula a tacada e entrega o RESULTADO; aqui decidimos falta,
// atribuição de grupo, troca de vez, bola na mão e vitória/derrota.
//
// Bolas: lisas 1–7, listradas 9–15, a 8 é a preta, 0 é a branca.
//
// `shot` (resultado de uma tacada):
//   potted            número[]  ids encaçapados (sem a branca)
//   cuePotted         bool      a branca caiu (scratch)
//   firstContact      número|null  1ª bola que a branca tocou (null = não tocou nada)
//   railAfterContact  bool      alguma bola tocou a tabela após o 1º contato (ou houve encaçapada)
//   remaining         {solids, stripes}  contagem de bolas de cada grupo AINDA na mesa DEPOIS da tacada (sem a 8)

export function initialState() {
  return { turn: 1, groups: { 1: null, 2: null }, open: true, phase: 'break', winner: null, ballInHand: false }
}

export function groupOf(ballId) {
  if (ballId >= 1 && ballId <= 7) return 'solid'
  if (ballId >= 9 && ballId <= 15) return 'stripe'
  if (ballId === 8) return 'eight'
  return 'cue'
}

export function resolveShot(state, shot) {
  const shooter = state.turn
  const opp = shooter === 1 ? 2 : 1
  const isBreak = state.phase === 'break'

  const pottedObjects = shot.potted.filter((id) => id !== 0)
  const pottedEight = pottedObjects.includes(8)
  const pottedNon8 = pottedObjects.filter((id) => id !== 8)
  const pottedSolids = pottedNon8.filter((id) => groupOf(id) === 'solid')
  const pottedStripes = pottedNon8.filter((id) => groupOf(id) === 'stripe')

  const groups = { ...state.groups }
  let open = state.open
  let shooterGroup = groups[shooter] // 'solid' | 'stripe' | null

  // Quantas bolas do próprio grupo havia ANTES desta tacada (para saber se
  // o atirador já estava "na 8").
  const remainingOwnBefore = shooterGroup === 'solid'
    ? shot.remaining.solids + pottedSolids.length
    : shooterGroup === 'stripe'
      ? shot.remaining.stripes + pottedStripes.length
      : null
  const estavaNaOito = shooterGroup != null && remainingOwnBefore === 0

  // ---------------- detecção de falta ----------------
  let foul = false
  let reason = ''
  if (shot.cuePotted) {
    foul = true; reason = 'Bola branca encaçapada'
  } else if (shot.firstContact == null) {
    foul = true; reason = 'Nenhuma bola atingida'
  } else if (!isBreak) {
    const alvo = groupOf(shot.firstContact)
    if (estavaNaOito) {
      if (shot.firstContact !== 8) { foul = true; reason = 'Precisava acertar a 8 primeiro' }
    } else if (shooterGroup) {
      if (alvo !== shooterGroup) { foul = true; reason = 'Grupo errado no primeiro contato' }
    } else if (shot.firstContact === 8) {
      foul = true; reason = 'Não pode acertar a 8 com a mesa aberta'
    }
  }
  if (!foul && pottedObjects.length === 0 && !shot.railAfterContact) {
    foul = true; reason = 'Nenhuma bola tocou a tabela'
  }

  // ---------------- a 8 encerra o jogo ----------------
  if (pottedEight) {
    const venceu = isBreak
      ? !shot.cuePotted // regra da casa: 8 na quebra vence (a menos que scratch junto)
      : estavaNaOito && !foul
    return {
      ...state,
      groups,
      open,
      phase: 'gameover',
      winner: venceu ? shooter : opp,
      ballInHand: false,
      foul: !venceu,
      potContinues: false,
      reason: venceu ? 'Encaçapou a 8 — venceu!' : 'Encaçapou a 8 fora de hora — perdeu',
    }
  }

  // ---------------- atribuição de grupo (mesa aberta, fora da quebra) ----------------
  if (open && !isBreak && !foul && pottedNon8.length > 0) {
    if (pottedSolids.length > 0 && pottedStripes.length === 0) {
      groups[shooter] = 'solid'; groups[opp] = 'stripe'; open = false
    } else if (pottedStripes.length > 0 && pottedSolids.length === 0) {
      groups[shooter] = 'stripe'; groups[opp] = 'solid'; open = false
    }
    // encaçapou dos dois grupos → mesa continua aberta
    shooterGroup = groups[shooter]
  }

  const base = { ...state, groups, open, phase: 'playing', winner: null }

  // ---------------- falta: passa a vez com bola na mão ----------------
  if (foul) {
    return { ...base, turn: opp, ballInHand: true, foul: true, potContinues: false, reason: reason || 'Falta' }
  }

  // ---------------- continuação de vez ----------------
  const encaçapouProprio = open
    ? pottedNon8.length > 0
    : shooterGroup === 'solid' ? pottedSolids.length > 0 : pottedStripes.length > 0

  if (encaçapouProprio) {
    return { ...base, turn: shooter, ballInHand: false, foul: false, potContinues: true, reason: 'Encaçapou — joga de novo' }
  }
  return { ...base, turn: opp, ballInHand: false, foul: false, potContinues: false, reason: 'Vez do adversário' }
}
