/**
 * Som do motor sintetizado no WebAudio — sem nenhum arquivo de áudio.
 *
 * Receita: duas serras levemente desafinadas (bate um "coro" que soa a motor
 * multicilindro) + uma onda triangular grave para a marcha lenta, tudo por um
 * passa-baixa que abre conforme a intensidade. Frequência, corte do filtro e
 * volume sobem juntos: acelerar soa mais agudo, mais brilhante e mais alto.
 *
 * Nada aqui pode derrubar o jogo: navegador sem WebAudio, contexto suspenso
 * pela política de autoplay ou nó indisponível apenas viram silêncio.
 */

const VOLUME_MESTRE = 0.16   // discreto: é jogo de TV, não fone de ouvido

export function criarMotor() {
  const Contexto = (typeof window !== 'undefined'
    && (window.AudioContext || window.webkitAudioContext)) || null

  let ctx = null
  let mestre = null
  let filtro = null
  let osciladores = []
  let ganhoRonco = null
  let ligado = false
  let intensidade = 0

  function iniciar() {
    if (!Contexto || ctx) { retomar(); return }
    try {
      ctx = new Contexto()

      mestre = ctx.createGain()
      mestre.gain.value = 0
      mestre.connect(ctx.destination)

      filtro = ctx.createBiquadFilter()
      filtro.type = 'lowpass'
      filtro.frequency.value = 420
      filtro.Q.value = 6
      filtro.connect(mestre)

      // Serras desafinadas: o batimento entre elas é o que dá corpo ao motor.
      for (const detune of [-9, 0, 7]) {
        const osc = ctx.createOscillator()
        osc.type = 'sawtooth'
        osc.frequency.value = 60
        osc.detune.value = detune
        const g = ctx.createGain()
        g.gain.value = 0.34
        osc.connect(g).connect(filtro)
        osc.start()
        osciladores.push({ osc, grave: false })
      }

      // Ronco grave constante: mantém o motor "vivo" mesmo sem acelerador.
      const ronco = ctx.createOscillator()
      ronco.type = 'triangle'
      ronco.frequency.value = 42
      ganhoRonco = ctx.createGain()
      ganhoRonco.gain.value = 0.5
      ronco.connect(ganhoRonco).connect(mestre)
      ronco.start()
      osciladores.push({ osc: ronco, grave: true })

      ligado = true
      aplicar()
    } catch (e) {
      ctx = null
    }
    retomar()
  }

  function aplicar() {
    if (!ctx || !ligado) return
    const i = Math.max(0, Math.min(1, intensidade))
    const agora = ctx.currentTime
    const suave = 0.12
    for (const { osc, grave } of osciladores) {
      const alvo = grave ? 38 + i * 26 : 58 + i * 128
      try { osc.frequency.setTargetAtTime(alvo, agora, suave) } catch (e) { /* ignora */ }
    }
    try {
      filtro.frequency.setTargetAtTime(380 + i * 1500, agora, suave)
      mestre.gain.setTargetAtTime(VOLUME_MESTRE * (0.55 + i * 0.45), agora, suave)
      ganhoRonco.gain.setTargetAtTime(0.55 - i * 0.28, agora, suave)
    } catch (e) { /* ignora */ }
  }

  function setIntensidade(valor) {
    intensidade = typeof valor === 'number' && Number.isFinite(valor) ? valor : 0
    aplicar()
  }

  function pausar() {
    if (!ctx) return
    try { mestre.gain.setTargetAtTime(0, ctx.currentTime, 0.05) } catch (e) { /* ignora */ }
    if (ctx.suspend) ctx.suspend().catch(() => {})
  }

  function retomar() {
    if (!ctx) return
    if (ctx.resume) ctx.resume().catch(() => {})
    aplicar()
  }

  function parar() {
    if (!ctx) return
    for (const { osc } of osciladores) {
      try { osc.stop() } catch (e) { /* ignora */ }
    }
    osciladores = []
    ligado = false
    try { ctx.close() } catch (e) { /* ignora */ }
    ctx = null
  }

  return { iniciar, setIntensidade, pausar, retomar, parar }
}
