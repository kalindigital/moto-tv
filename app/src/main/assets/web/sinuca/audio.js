/**
 * Sons da sinuca sintetizados no WebAudio — nenhum arquivo de áudio.
 *
 * Quatro efeitos, todos rajadas curtas geradas na hora:
 *  - taco:   "thock" grave da tacada (intensidade = força)
 *  - bola:   clique curto e agudo do choque entre bolas (intensidade = impacto)
 *  - tabela: baque mais surdo ao bater na tabela
 *  - caçapa: "plunc" descendente quando a bola cai
 *
 * Nada aqui pode derrubar o jogo: sem WebAudio, contexto suspenso ou nó
 * indisponível viram apenas silêncio.
 */

export function criarSons() {
  const Contexto = (typeof window !== 'undefined'
    && (window.AudioContext || window.webkitAudioContext)) || null
  let ctx = null

  function garantir() {
    if (!Contexto) return null
    if (!ctx) {
      try { ctx = new Contexto() } catch { ctx = null }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx
  }

  // Envelope de um oscilador simples com ataque instantâneo e decaimento curto.
  function tom(freq, dur, vol, tipo = 'sine', slideTo = null) {
    const c = garantir()
    if (!c) return
    try {
      const osc = c.createOscillator()
      const g = c.createGain()
      osc.type = tipo
      osc.frequency.setValueAtTime(freq, c.currentTime)
      if (slideTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), c.currentTime + dur)
      g.gain.setValueAtTime(0.0001, c.currentTime)
      g.gain.exponentialRampToValueAtTime(vol, c.currentTime + 0.004)
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur)
      osc.connect(g).connect(c.destination)
      osc.start()
      osc.stop(c.currentTime + dur + 0.02)
    } catch { /* silêncio */ }
  }

  // Ruído curto passado por um filtro — dá o "clac" seco do choque.
  function ruido(dur, vol, freq, q = 1) {
    const c = garantir()
    if (!c) return
    try {
      const n = Math.floor(c.sampleRate * dur)
      const buffer = c.createBuffer(1, n, c.sampleRate)
      const dados = buffer.getChannelData(0)
      for (let i = 0; i < n; i++) dados[i] = (Math.random() * 2 - 1) * (1 - i / n)
      const src = c.createBufferSource()
      src.buffer = buffer
      const filtro = c.createBiquadFilter()
      filtro.type = 'bandpass'
      filtro.frequency.value = freq
      filtro.Q.value = q
      const g = c.createGain()
      g.gain.value = vol
      src.connect(filtro).connect(g).connect(c.destination)
      src.start()
    } catch { /* silêncio */ }
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

  return {
    liberar() { garantir() },
    taco(forca) {
      const f = clamp(forca, 0, 1)
      tom(150 - f * 40, 0.12, 0.18 + f * 0.16, 'triangle')
      ruido(0.05, 0.12 + f * 0.1, 2200, 0.8)
    },
    bola(impacto) {
      const i = clamp(impacto, 0, 1)
      if (i < 0.02) return
      ruido(0.03, 0.05 + i * 0.28, 2600 + i * 1600, 1.2)
      tom(900 + i * 700, 0.04, 0.03 + i * 0.12, 'sine')
    },
    tabela(impacto) {
      const i = clamp(impacto, 0, 1)
      if (i < 0.04) return
      tom(180, 0.07, 0.05 + i * 0.12, 'sine')
      ruido(0.04, 0.04 + i * 0.08, 500, 0.7)
    },
    cacapa() {
      tom(420, 0.22, 0.16, 'sine', 120)
      ruido(0.12, 0.1, 300, 0.6)
    },
  }
}
