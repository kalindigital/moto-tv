// Geometria da mesa e desenho no Canvas 2D. Sem regra de jogo aqui — só layout
// e pintura. As coordenadas do mundo vão de (0,0) a (W,H); o `layout` converte
// para pixels, mantendo a proporção e centralizando na tela.

export const MESA = {
  W: 200,          // comprimento (eixo x) — mesa 2:1
  H: 100,          // largura (eixo y)
  r: 3.4,          // raio da bola
  captura: 4.4,    // distância do centro da caçapa que "engole" a bola
  boca: 7.6,       // zona da boca da caçapa (tabela some para a bola cair)
  restituicao: 0.9,
}

export const BORDA = 15 // madeira ao redor do pano (só visual)

// Paletas escolhidas no celular (ids batem com cue-protocol).
export const MESAS = {
  verde: { a: '#1f8a4c', b: '#136534' },
  azul: { a: '#1f6fb0', b: '#123f6e' },
  vinho: { a: '#8a1f4a', b: '#4f1029' },
}
export const TACOS = {
  classico: '#caa15a',
  grafite: '#4a4a55',
  vermelho: '#c0392b',
}

export function bounds() {
  return { left: MESA.r, right: MESA.W - MESA.r, top: MESA.r, bottom: MESA.H - MESA.r }
}

export function pockets() {
  const { W, H } = MESA
  return [
    { x: 0, y: 0 }, { x: W / 2, y: 0 }, { x: W, y: 0 },
    { x: 0, y: H }, { x: W / 2, y: H }, { x: W, y: H },
  ]
}

// Cor de cada número (as listradas 9–15 usam a cor de id-8).
export const CORES = {
  1: '#f4c20d', 2: '#123e9c', 3: '#d1341f', 4: '#5b2a86',
  5: '#e6741b', 6: '#0f8a4a', 7: '#7a1f1f',
}

export function corDaBola(id) {
  if (id === 0) return '#f4f1e8'
  if (id === 8) return '#101014'
  if (id >= 9) return CORES[id - 8]
  return CORES[id]
}

export function ehListrada(id) {
  return id >= 9 && id <= 15
}

/** Calcula escala e deslocamento para caber a mesa (com borda) no canvas. */
export function criarLayout(larguraPx, alturaPx) {
  const totalW = MESA.W + BORDA * 2
  const totalH = MESA.H + BORDA * 2
  const escala = Math.min(larguraPx / totalW, alturaPx / totalH)
  const ox = (larguraPx - totalW * escala) / 2 + BORDA * escala
  const oy = (alturaPx - totalH * escala) / 2 + BORDA * escala
  return {
    escala,
    px: (x) => ox + x * escala,
    py: (y) => oy + y * escala,
    pr: (r) => r * escala,
  }
}

function retanguloArredondado(ctx, x, y, w, h, raio) {
  ctx.beginPath()
  ctx.moveTo(x + raio, y)
  ctx.arcTo(x + w, y, x + w, y + h, raio)
  ctx.arcTo(x + w, y + h, x, y + h, raio)
  ctx.arcTo(x, y + h, x, y, raio)
  ctx.arcTo(x, y, x + w, y, raio)
  ctx.closePath()
}

function desenharBola(ctx, layout, bola) {
  const cx = layout.px(bola.x)
  const cy = layout.py(bola.y)
  const raio = layout.pr(MESA.r)
  const cor = corDaBola(bola.id)

  ctx.save()
  // sombra no pano
  ctx.beginPath()
  ctx.fillStyle = 'rgba(0,0,0,.35)'
  ctx.ellipse(cx + raio * 0.16, cy + raio * 0.22, raio * 0.98, raio * 0.9, 0, 0, Math.PI * 2)
  ctx.fill()

  // corpo
  ctx.beginPath()
  ctx.arc(cx, cy, raio, 0, Math.PI * 2)
  ctx.fillStyle = ehListrada(bola.id) ? '#f4f1e8' : cor
  ctx.fill()

  // faixa das listradas
  if (ehListrada(bola.id)) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, raio, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = cor
    ctx.fillRect(cx - raio, cy - raio * 0.52, raio * 2, raio * 1.04)
    ctx.restore()
  }

  // disco branco central + número (menos a branca)
  if (bola.id !== 0) {
    ctx.beginPath()
    ctx.arc(cx, cy, raio * 0.46, 0, Math.PI * 2)
    ctx.fillStyle = '#fbfaf5'
    ctx.fill()
    ctx.fillStyle = '#15151c'
    ctx.font = `700 ${Math.max(6, raio * 0.62)}px "Roboto Condensed",system-ui,sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(bola.id), cx, cy + raio * 0.04)
  }

  // brilho especular
  ctx.beginPath()
  ctx.arc(cx - raio * 0.32, cy - raio * 0.34, raio * 0.42, 0, Math.PI * 2)
  const g = ctx.createRadialGradient(cx - raio * 0.32, cy - raio * 0.34, 0, cx - raio * 0.32, cy - raio * 0.34, raio * 0.5)
  g.addColorStop(0, 'rgba(255,255,255,.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fill()
  ctx.restore()
}

/**
 * Desenha a mesa inteira: madeira, pano, caçapas, bolas e — se houver mira ativa —
 * a linha de mira, o taco e a barra de força.
 * `cena` = { balls, aim:{ativo,angle,power,x,y}, ballInHand, mesaAberta }
 */
export function desenhar(ctx, layout, cena) {
  const { W, H } = MESA
  const x0 = layout.px(0)
  const y0 = layout.py(0)
  const larg = layout.pr(W)
  const alt = layout.pr(H)
  const b = layout.pr(BORDA)

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

  // madeira
  retanguloArredondado(ctx, x0 - b, y0 - b, larg + b * 2, alt + b * 2, b * 0.9)
  const grad = ctx.createLinearGradient(0, y0 - b, 0, y0 + alt + b)
  grad.addColorStop(0, '#5a3620')
  grad.addColorStop(1, '#3a2214')
  ctx.fillStyle = grad
  ctx.fill()

  // pano (cor escolhida no celular)
  const felt = cena.felt || MESAS.verde
  retanguloArredondado(ctx, x0, y0, larg, alt, b * 0.35)
  const pano = ctx.createRadialGradient(x0 + larg / 2, y0 + alt / 2, alt * 0.2, x0 + larg / 2, y0 + alt / 2, larg * 0.7)
  pano.addColorStop(0, felt.a)
  pano.addColorStop(1, felt.b)
  ctx.fillStyle = pano
  ctx.fill()

  // caçapas
  for (const p of pockets()) {
    ctx.beginPath()
    ctx.arc(layout.px(p.x), layout.py(p.y), layout.pr(MESA.captura * 1.35), 0, Math.PI * 2)
    ctx.fillStyle = '#0a0a0d'
    ctx.fill()
  }

  // linha do cabeçalho (head string), leve
  ctx.strokeStyle = 'rgba(255,255,255,.10)'
  ctx.lineWidth = Math.max(1, layout.escala * 0.4)
  ctx.beginPath()
  ctx.moveTo(layout.px(W * 0.25), y0)
  ctx.lineTo(layout.px(W * 0.25), y0 + alt)
  ctx.stroke()

  // mira + taco
  const aim = cena.aim
  if (aim && aim.ativo) {
    const cx = layout.px(aim.x)
    const cy = layout.py(aim.y)
    const dx = Math.cos(aim.angle)
    const dy = Math.sin(aim.angle)
    const raio = layout.pr(MESA.r)

    // linha de mira pontilhada à frente da branca
    ctx.save()
    ctx.setLineDash([layout.escala * 1.5, layout.escala * 1.5])
    ctx.strokeStyle = 'rgba(255,255,255,.75)'
    ctx.lineWidth = Math.max(1, layout.escala * 0.5)
    ctx.beginPath()
    ctx.moveTo(cx + dx * raio, cy + dy * raio)
    ctx.lineTo(cx + dx * layout.pr(W), cy + dy * layout.pr(W))
    ctx.stroke()
    ctx.restore()

    // taco atrás da branca, recuado conforme a força (cor escolhida no celular)
    const recuo = raio * (1.6 + aim.power * 6)
    const compTaco = layout.pr(70)
    const bx = cx - dx * recuo
    const by = cy - dy * recuo
    ctx.strokeStyle = cena.tacoCor || TACOS.classico
    ctx.lineWidth = Math.max(2, raio * 0.5)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.lineTo(bx - dx * compTaco, by - dy * compTaco)
    ctx.stroke()
    // ponteira
    ctx.strokeStyle = '#eef1f6'
    ctx.lineWidth = Math.max(2, raio * 0.5)
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.lineTo(bx - dx * raio * 1.1, by - dy * raio * 1.1)
    ctx.stroke()
  }

  // bolas
  for (const bola of cena.balls) {
    if (bola.potted) continue
    if (bola.id === 0 && cena.ballInHand && cena.escondeBranca) continue
    desenharBola(ctx, layout, bola)
  }

  // bolas caindo na caçapa (some com fade + leve encolhimento indo ao buraco)
  if (cena.caindo) {
    for (const c of cena.caindo) {
      const t = Math.max(0, Math.min(1, c.t))     // 0 → 1 ao longo da queda
      const x = c.x + (c.px - c.x) * t             // desliza até o centro da caçapa
      const y = c.y + (c.py - c.y) * t
      ctx.save()
      ctx.globalAlpha = 1 - t                      // a camada vai sumindo
      desenharBola(ctx, layout, { id: c.id, x, y })
      ctx.restore()
    }
  }
}
