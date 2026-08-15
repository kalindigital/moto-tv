// Adversário da máquina — puro (sem DOM/Canvas), para dar para testar.
//
// A ideia é a de qualquer jogador: escolher a bola mais fácil de encaçapar,
// mirar no "ponto fantasma" (onde a branca precisa estar na hora do toque para
// empurrar a bola em direção à caçapa) e dosar a força pela distância.
//
// A máquina NÃO é infalível de propósito: cada nível tem um erro de mira e uma
// chance de "vacilo" (um desvio bem maior, como quem escorrega no taco). Sem
// isso o jogo contra a máquina não teria graça.

export const DIFICULDADES = {
  // erro: desvio máximo da mira, em radianos (~0.10 rad ≈ 6°)
  // chanceVacilo: probabilidade de errar feio na tacada
  // vacilo: desvio máximo quando vacila
  // forcaRuido: variação relativa da força
  facil: { erro: 0.115, chanceVacilo: 0.30, vacilo: 0.34, forcaRuido: 0.26 },
  medio: { erro: 0.055, chanceVacilo: 0.17, vacilo: 0.22, forcaRuido: 0.16 },
  dificil: { erro: 0.020, chanceVacilo: 0.08, vacilo: 0.14, forcaRuido: 0.09 },
}

const ehLisa = (id) => id >= 1 && id <= 7
const ehListrada = (id) => id >= 9 && id <= 15

/** Bolas que a máquina pode atacar agora, conforme o grupo e o estado da mesa. */
export function alvosPossiveis(balls, { grupo, mesaAberta }) {
  const vivas = balls.filter((b) => !b.potted && b.id !== 0)
  if (mesaAberta || !grupo) return vivas.filter((b) => b.id !== 8)

  const doGrupo = vivas.filter((b) => (grupo === 'solid' ? ehLisa(b.id) : ehListrada(b.id)))
  // Grupo limpo: a vez é da 8.
  if (doGrupo.length === 0) return vivas.filter((b) => b.id === 8)
  return doGrupo
}

/** Distância do ponto P ao segmento AB — usada para ver se uma bola atrapalha. */
function distanciaAoSegmento(px, py, ax, ay, bx, by) {
  const vx = bx - ax
  const vy = by - ay
  const comp = vx * vx + vy * vy
  const t = comp === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / comp))
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t))
}

/** Há alguma bola (fora as ignoradas) atravessada no caminho de A até B? */
function caminhoLivre(balls, ax, ay, bx, by, ignorar, raio) {
  return !balls.some((b) => {
    if (b.potted || ignorar.includes(b.id)) return false
    return distanciaAoSegmento(b.x, b.y, ax, ay, bx, by) < raio * 2
  })
}

/**
 * Escolhe a tacada. Devolve { angle, power, alvo } — sempre algo jogável, mesmo
 * sem alvo limpo (aí dá uma tacada de saída, para não travar a partida).
 *
 * `opts.rnd` permite fixar o acaso nos testes; `opts.erro` sobrepõe o erro do
 * nível (usado para calcular a mira exata nos testes).
 */
export function escolherTacada(balls, pockets, opts = {}) {
  const { grupo = null, mesaAberta = false, dificuldade = 'medio', rnd = Math.random } = opts
  const nivel = DIFICULDADES[dificuldade] || DIFICULDADES.medio
  // Erro dado à mão manda em tudo (é o que os testes usam para conferir a mira
  // exata): nesse caso a máquina não vacila, o desvio é só o pedido.
  const erroExplicito = opts.erro != null
  const erro = erroExplicito ? opts.erro : nivel.erro

  const cue = balls.find((b) => b.id === 0 && !b.potted)
  if (!cue) return null
  const raio = cue.r || 3.4

  let melhor = null
  for (const alvo of alvosPossiveis(balls, { grupo, mesaAberta })) {
    for (const poc of pockets) {
      // ponto fantasma: 2 raios atrás da bola, na linha bola → caçapa
      const dpx = poc.x - alvo.x
      const dpy = poc.y - alvo.y
      const dp = Math.hypot(dpx, dpy)
      if (dp === 0) continue
      const ux = dpx / dp
      const uy = dpy / dp
      const gx = alvo.x - ux * raio * 2
      const gy = alvo.y - uy * raio * 2

      const dcx = gx - cue.x
      const dcy = gy - cue.y
      const dc = Math.hypot(dcx, dcy)
      if (dc < 1e-6) continue

      // ângulo de corte: quanto mais reto (produto escalar perto de 1), melhor
      const corte = (dcx / dc) * ux + (dcy / dc) * uy
      if (corte <= 0.18) continue   // corte quase perpendicular: não vale tentar

      if (!caminhoLivre(balls, cue.x, cue.y, gx, gy, [0, alvo.id], raio)) continue
      if (!caminhoLivre(balls, alvo.x, alvo.y, poc.x, poc.y, [alvo.id, 0], raio)) continue

      // nota: favorece tacada reta e curta
      const nota = (corte * corte * 100) / (dc + dp)
      if (!melhor || nota > melhor.nota) {
        melhor = { nota, alvo: alvo.id, angle: Math.atan2(dcy, dcx), distancia: dc + dp }
      }
    }
  }

  // Sem nada limpo: bate na bola mais próxima do próprio grupo (ou em qualquer
  // uma), só para não cometer falta de "não tocar em nada".
  if (!melhor) {
    const candidatos = alvosPossiveis(balls, { grupo, mesaAberta })
    const alvo = candidatos
      .map((b) => ({ b, d: Math.hypot(b.x - cue.x, b.y - cue.y) }))
      .sort((x, y) => x.d - y.d)[0]
    melhor = alvo
      ? { alvo: alvo.b.id, angle: Math.atan2(alvo.b.y - cue.y, alvo.b.x - cue.x), distancia: alvo.d }
      : { alvo: null, angle: rnd() * Math.PI * 2, distancia: 60 }
  }

  // erro de mira: o desvio normal do nível e, de vez em quando, um vacilo feio
  const vacilou = !erroExplicito && rnd() < nivel.chanceVacilo
  const desvio = vacilou ? nivel.vacilo : erro
  const sinal = rnd() < 0.5 ? -1 : 1
  const angle = melhor.angle + sinal * desvio

  // força pela distância, com um ruído para não ficar robótica
  const base = Math.max(0.34, Math.min(0.92, 0.3 + melhor.distancia / 260))
  const power = Math.max(0.2, Math.min(1, base * (1 + (rnd() * 2 - 1) * nivel.forcaRuido)))

  return { angle, power, alvo: melhor.alvo, vacilou }
}
