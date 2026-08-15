import { gammaToSteer } from '../shared/steering.js'
import { serializeSteer, serializeAction, serializeThrottle, serializeSetup } from '../shared/protocol.js'

const wsUrl = `wss://${location.host}/ws`

// ---------- estado ----------
let ws
let neutral = 0            // ângulo considerado "reto" (calibragem)
let ultimoGamma = null     // última leitura válida do sensor
let lastSent = 0
let lastValue = 999
let acelerando = false
let pausado = false
let motoEscolhida = 'sk'
let periodoEscolhido = 'dia'
let setupPendente = null   // setup que ainda não conseguiu sair (envia ao conectar)

// ---------- elementos ----------
const dot = document.getElementById('dot')
const conn = document.getElementById('conn')
const fill = document.getElementById('fill')
const aviso = document.getElementById('aviso')
const telaPreparacao = document.getElementById('tela-preparacao')
const telaControle = document.getElementById('tela-controle')
const botaoComecar = document.getElementById('comecar')
const botaoAcelerar = document.getElementById('acelerar')
const botaoPausar = document.getElementById('pausar')

// ---------- conexão ----------
function connect() {
  ws = new WebSocket(wsUrl)
  ws.onopen = () => {
    dot.classList.add('on')
    conn.textContent = 'conectado'
    // Se o "Começar" foi tocado offline, manda a escolha assim que conectar.
    if (setupPendente && enviar(setupPendente)) setupPendente = null
  }
  ws.onclose = () => {
    dot.classList.remove('on')
    conn.textContent = 'reconectando…'
    setTimeout(connect, 1000)
  }
  ws.onerror = () => ws.close()
}

function enviar(mensagem) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false
  ws.send(mensagem)
  return true
}

function vibrar(ms) {
  // navigator.vibrate não existe no iOS nem em desktop — sempre opcional.
  if (typeof navigator.vibrate !== 'function') return
  try { navigator.vibrate(ms) } catch { /* ignora */ }
}

function mostrarAviso(texto) {
  aviso.textContent = texto
  aviso.hidden = !texto
}

// ---------- inclinação → direção ----------
function onOrientation(e) {
  const gamma = Number.isFinite(e.gamma) ? e.gamma : 0
  ultimoGamma = gamma
  const steer = gammaToSteer(gamma, { neutral, maxAngle: 35, deadzone: 3 })
  fill.style.width = `${(steer + 1) * 50}%`
  const now = performance.now()
  if (now - lastSent > 16 && Math.abs(steer - lastValue) > 0.01) {
    lastSent = now
    lastValue = steer
    enviar(serializeSteer(steer))
  }
}

async function pedirPermissaoMovimento() {
  // Só o iOS 13+ expõe requestPermission; no Android/desktop basta ouvir o evento.
  if (typeof DeviceOrientationEvent === 'undefined') return false
  if (typeof DeviceOrientationEvent.requestPermission !== 'function') return true
  try {
    return await DeviceOrientationEvent.requestPermission() === 'granted'
  } catch {
    return false
  }
}

// ---------- acelerador ----------
function definirAcelerador(ativo) {
  if (ativo === acelerando) return
  acelerando = ativo
  botaoAcelerar.classList.toggle('ativo', ativo)
  enviar(serializeThrottle(ativo))
  if (ativo) vibrar(12)
}

const acelerar = () => definirAcelerador(true)
const soltar = () => definirAcelerador(false)

if (typeof window.PointerEvent === 'function') {
  botaoAcelerar.addEventListener('pointerdown', (e) => { e.preventDefault(); acelerar() })
  // Solta no window: se o dedo escorregar para fora do botão, o evento ainda chega.
  window.addEventListener('pointerup', soltar)
  window.addEventListener('pointercancel', soltar)
} else {
  botaoAcelerar.addEventListener('touchstart', (e) => { e.preventDefault(); acelerar() }, { passive: false })
  window.addEventListener('touchend', soltar)
  window.addEventListener('touchcancel', soltar)
  botaoAcelerar.addEventListener('mousedown', acelerar)
  window.addEventListener('mouseup', soltar)
}

// Redes de segurança para o acelerador nunca ficar "preso" ligado.
window.addEventListener('blur', soltar)
document.addEventListener('visibilitychange', () => { if (document.hidden) soltar() })
botaoAcelerar.addEventListener('contextmenu', (e) => e.preventDefault())

// ---------- tela 1: escolhas ----------
function selecionar(container, atributo, valor) {
  for (const botao of container.querySelectorAll(`[data-${atributo}]`)) {
    botao.setAttribute('aria-pressed', String(botao.dataset[atributo] === valor))
  }
}

document.getElementById('motos').addEventListener('click', (e) => {
  const botao = e.target.closest('[data-moto]')
  if (!botao) return
  motoEscolhida = botao.dataset.moto
  selecionar(document.getElementById('motos'), 'moto', motoEscolhida)
  vibrar(8)
})

document.getElementById('periodos').addEventListener('click', (e) => {
  const botao = e.target.closest('[data-periodo]')
  if (!botao) return
  periodoEscolhido = botao.dataset.periodo
  selecionar(document.getElementById('periodos'), 'periodo', periodoEscolhido)
  vibrar(8)
})

botaoComecar.addEventListener('click', async () => {
  botaoComecar.disabled = true
  // Wake Lock também exige gesto do usuário — aproveitamos este mesmo clique.
  manterTelaAcesa()
  // A permissão do iOS precisa nascer de um gesto do usuário — este clique.
  const permitido = await pedirPermissaoMovimento()
  botaoComecar.disabled = false
  if (permitido) {
    window.addEventListener('deviceorientation', onOrientation)
    mostrarAviso('')
  } else {
    // Sem sensor dá para acelerar e usar os botões; só a direção fica de fora.
    mostrarAviso('Sem permissão de movimento: a direção por inclinação não vai funcionar.')
  }

  const setup = serializeSetup(periodoEscolhido, motoEscolhida)
  if (!enviar(setup)) setupPendente = setup

  telaPreparacao.hidden = true
  telaControle.hidden = false
})

// ---------- tela 2: ações ----------
botaoPausar.addEventListener('click', () => {
  pausado = !pausado
  botaoPausar.textContent = pausado ? 'Retomar' : 'Pausar'
  botaoPausar.dataset.pausado = String(pausado)
  enviar(serializeAction(pausado ? 'pause' : 'resume'))
  if (pausado) soltar()
})

document.getElementById('calibrar').addEventListener('click', () => {
  // Usa a leitura atual como novo neutro; se o sensor ainda não falou, espera a próxima.
  if (ultimoGamma !== null) {
    neutral = ultimoGamma
  } else {
    window.addEventListener('deviceorientation', function uma(e) {
      neutral = Number.isFinite(e.gamma) ? e.gamma : 0
      window.removeEventListener('deviceorientation', uma)
    }, { once: true })
  }
  vibrar(20)
})

document.getElementById('reiniciar').addEventListener('click', () => {
  enviar(serializeAction('restart'))
  soltar()
  // O jogo volta a rodar depois do restart: o botão precisa refletir isso.
  pausado = false
  botaoPausar.textContent = 'Pausar'
  botaoPausar.dataset.pausado = 'false'
})

document.getElementById('qr').addEventListener('click', () => {
  enviar(serializeAction('qr'))
})

// Segurar o celular inclinado não conta como toque: sem isso a tela apaga no meio
// da partida e o controle cai junto. O Wake Lock é liberado pelo próprio sistema
// quando a aba sai de foco, então pedimos de novo ao voltar.
let travaDeTela = null

async function manterTelaAcesa() {
  if (!('wakeLock' in navigator)) return
  try {
    travaDeTela = await navigator.wakeLock.request('screen')
    travaDeTela.addEventListener('release', () => { travaDeTela = null })
  } catch {
    travaDeTela = null
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && travaDeTela === null) manterTelaAcesa()
})

connect()
