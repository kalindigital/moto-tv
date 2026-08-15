import {
  serializePick, serializeAim, serializeShoot, serializePlace, serializeSinucaSetup,
  serializeJoin, parseMessage,
} from '../shared/cue-protocol.js'
import { serializeAction } from '../shared/protocol.js'

/**
 * Controle da sinuca no celular.
 *
 * Aparência (taco/mesa) na primeira tela; depois o "estilingue": arraste o dedo
 * para trás para mirar/dar força e solte para tacar. As mensagens vão pela WS
 * para a TV (aim ao vivo, shoot ao soltar). A TV devolve o turno (`turn`) para
 * mostrar de quem é a vez no hotseat. "Sair" volta ao seletor de jogos.
 */

const el = (id) => document.getElementById(id)
const dot = el('dot')
const conn = el('conn')
const telaPrep = el('tela-sinuca-prep')
const telaCtrl = el('tela-sinuca')
const pad = el('padSinuca')
const ctx = pad.getContext('2d')
const botaoPos = el('sinuca-posicionar')

// Identidade deste celular (um por aba/aparelho): define qual jogador ele é.
// O seletor (controle.js) já pode ter entrado no lobby e recebido a vaga —
// nesse caso reaproveitamos id e jogador para não pedir vaga duas vezes.
const meuId = (window.__ctrl && window.__ctrl.id)
  || ((window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : `c${Math.random().toString(36).slice(2)}${Date.now()}`)

let ws = null
let taco = 'classico'
let mesa = 'verde'
let ultimoSetup = null
let ballInHand = false
let modoPosicionar = false
let meuPlayer = (window.__ctrl && window.__ctrl.player) || null   // 1 ou 2, atribuído pela TV
let primeiroTurno = true // o 1º 'turn' decide a tela (aparência x pad)
let vezAtual = 1         // de quem é a vez (do último 'turn')
let vezCid = null        // id do controle dono da vez (null = vaga aberta)
let faseJogo = 'playing'
let vencedor = null
let reingresso = null    // reenvia 'join' até ser atribuído

// ------------------------------------------------------------------ util
function enviar(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) { ws.send(msg); return true }
  return false
}
function vibrar(ms) {
  if (typeof navigator.vibrate !== 'function') return
  try { navigator.vibrate(ms) } catch { /* ignora */ }
}

// ------------------------------------------------------------- WebSocket
function connect() {
  ws = new WebSocket(`wss://${location.host}/ws`)
  ws.onopen = () => {
    dot.classList.add('on')
    conn.textContent = 'conectado'
    enviar(serializePick('sinuca'))    // pede à TV para abrir a sinuca
    enviar(serializeJoin(meuId))       // (re)entra no lobby: vira Jogador 1 ou 2
    if (ultimoSetup) enviar(ultimoSetup)
    // O join também é batimento: enquanto não há vaga ele insiste, e depois
    // mantém a TV sabendo que este celular continua vivo (para reciclar a vaga
    // de quem saiu, por exemplo ao recarregar a página com outro id).
    if (!reingresso) {
      reingresso = setInterval(() => enviar(serializeJoin(meuId)), 1500)
    }
  }
  ws.onclose = () => {
    dot.classList.remove('on')
    conn.textContent = 'reconectando…'
    setTimeout(connect, 1000)
  }
  ws.onerror = () => ws.close()
  ws.onmessage = (ev) => {
    const m = parseMessage(ev.data)
    if (m.type === 'assign' && m.id === meuId) aplicarAtribuicao(m.player)
    else if (m.type === 'turn') aplicarTurno(m)
  }
}

function irParaPad() {
  if (telaCtrl.hidden) {
    telaPrep.hidden = true
    telaCtrl.hidden = false
    requestAnimationFrame(dimensionarPad)
  }
}

function aplicarAtribuicao(player) {
  const mudou = meuPlayer !== player
  meuPlayer = player
  if (window.__ctrl) window.__ctrl.player = player
  // Jogador 2 não escolhe a aparência (a mesa é do Jogador 1): vai direto ao pad
  if (player === 2) irParaPad()
  if (mudou) atualizarCabecalho()
}

let grupoAtual = null

function aplicarTurno(m) {
  vezAtual = m.player
  vezCid = m.controllerId || null
  ballInHand = m.ballInHand
  faseJogo = m.phase
  vencedor = m.winner
  grupoAtual = m.group
  // Entrou com a partida já rolando: pula a aparência e vai direto para o pad.
  if (primeiroTurno) {
    primeiroTurno = false
    if (faseJogo !== 'espera') irParaPad()
  }
  atualizarCabecalho()
  desenharPad()
}

// Só é minha vez se a vaga da vez estiver aberta (sem dono) ou for o meu id.
function minhaVez() {
  if (faseJogo === 'gameover') return false
  return !vezCid || vezCid === meuId
}

function atualizarCabecalho() {
  const vez = el('sinuca-vez')
  const sub = el('sinuca-sub')
  const grupo = grupoAtual === 'solid' ? 'Lisas' : grupoAtual === 'stripe' ? 'Listradas' : 'Mesa aberta'
  const euSou = meuPlayer ? ` · você é o Jogador ${meuPlayer}` : ''
  if (faseJogo === 'gameover') {
    vez.textContent = `Jogador ${vencedor} venceu! 🎉`
    sub.textContent = 'Toque em Reiniciar para jogar de novo'
  } else if (minhaVez()) {
    vez.textContent = `Sua vez${euSou}`
    sub.textContent = ballInHand ? 'Bola na mão — posicione a branca e tace' : `${grupo} · arraste para trás e solte`
  } else {
    vez.textContent = `Vez do Jogador ${vezAtual}`
    sub.textContent = `Aguarde${euSou}`
  }
  const mostrarBih = ballInHand && faseJogo !== 'gameover' && minhaVez()
  el('sinuca-bih').classList.toggle('on', mostrarBih)
  botaoPos.hidden = !mostrarBih
  if (!mostrarBih) { modoPosicionar = false; botaoPos.classList.remove('on') }
}

// ---------------------------------------------------------- tela de aparência
function selecionar(container, attr, valor) {
  for (const b of container.querySelectorAll(`[data-${attr}]`)) {
    b.setAttribute('aria-pressed', String(b.dataset[attr] === valor))
  }
}
el('tacos').addEventListener('click', (e) => {
  const b = e.target.closest('[data-taco]'); if (!b) return
  taco = b.dataset.taco; selecionar(el('tacos'), 'taco', taco); vibrar(8)
})
el('mesas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mesa]'); if (!b) return
  mesa = b.dataset.mesa; selecionar(el('mesas'), 'mesa', mesa); vibrar(8)
})

el('sinuca-comecar').addEventListener('click', () => {
  manterTelaAcesa()
  ultimoSetup = serializeSinucaSetup(taco, mesa)
  enviar(ultimoSetup)
  enviar(serializeAction('restart'))   // (re)inicia a partida com a aparência escolhida
  telaPrep.hidden = true
  telaCtrl.hidden = false
  requestAnimationFrame(dimensionarPad)
})

// --------------------------------------------------------------- ações
el('sinuca-reiniciar').addEventListener('click', () => {
  vibrar(12)
  // O Jogador 1 é o dono da mesa: volta à aparência para trocar taco/mesa antes
  // de recomeçar. O Jogador 2 apenas pede o reinício.
  if (meuPlayer === 2) { enviar(serializeAction('restart')); return }
  telaCtrl.hidden = true
  telaPrep.hidden = false
})
el('sinuca-qr').addEventListener('click', () => enviar(serializeAction('qr')))
el('sinuca-sair').addEventListener('click', () => {
  enviar(serializeAction('menu'))   // manda a TV de volta ao menu
  vibrar(20)
  setTimeout(() => location.reload(), 140)   // volta ao seletor de jogos
})
botaoPos.addEventListener('click', () => {
  modoPosicionar = !modoPosicionar
  botaoPos.classList.toggle('on', modoPosicionar)
  desenharPad()
})

// -------------------------------------------------------------- o "pad"
function dimensionarPad() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const r = pad.getBoundingClientRect()
  pad.width = Math.max(1, Math.floor(r.width * dpr))
  pad.height = Math.max(1, Math.floor(r.height * dpr))
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  desenharPad()
}
window.addEventListener('resize', dimensionarPad)

function tableRect() {
  const W = pad.clientWidth
  const H = pad.clientHeight
  const m = 14
  let tw = W - 2 * m
  let th = tw / 2
  if (th > H - 2 * m) { th = H - 2 * m; tw = th * 2 }
  return { x: (W - tw) / 2, y: (H - th) / 2, w: tw, h: th }
}

let arrastando = false
let inicio = null
let atual = null
let ultimoEnvio = 0

const maxDrag = () => Math.min(pad.clientWidth, pad.clientHeight) * 0.42

function posLocal(e) {
  const r = pad.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

// estilingue: atira no sentido OPOSTO ao arraste; força = distância / maxDrag
function calc() {
  const dx = atual.x - inicio.x
  const dy = atual.y - inicio.y
  const power = Math.max(0, Math.min(1, Math.hypot(dx, dy) / maxDrag()))
  const angle = Math.atan2(-dy, -dx)
  return { angle, power }
}

pad.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  if (!minhaVez()) return   // não é a sua vez: pad travado
  if (pad.setPointerCapture) { try { pad.setPointerCapture(e.pointerId) } catch { /* ignora */ } }
  const p = posLocal(e)
  if (modoPosicionar) { posicionar(p); return }
  arrastando = true; inicio = p; atual = p
  desenharPad()
})
pad.addEventListener('pointermove', (e) => {
  if (!arrastando) return
  atual = posLocal(e)
  const agora = performance.now()
  if (agora - ultimoEnvio > 40) {
    ultimoEnvio = agora
    const { angle, power } = calc()
    enviar(serializeAim(angle, power, meuId))
  }
  desenharPad()
})
function soltar() {
  if (!arrastando) return
  arrastando = false
  const { angle, power } = calc()
  if (power > 0.06) { enviar(serializeShoot(angle, power, meuId)); vibrar(24) }
  inicio = atual = null
  desenharPad()
}
pad.addEventListener('pointerup', soltar)
pad.addEventListener('pointercancel', soltar)

function posicionar(p) {
  const r = tableRect()
  const nx = Math.max(0, Math.min(1, (p.x - r.x) / r.w))
  const ny = Math.max(0, Math.min(1, (p.y - r.y) / r.h))
  enviar(serializePlace(nx, ny, meuId))
  vibrar(12)
  modoPosicionar = false
  botaoPos.classList.remove('on')
  desenharPad()
}

function retangulo(x, y, w, h, raio) {
  ctx.beginPath()
  ctx.moveTo(x + raio, y)
  ctx.arcTo(x + w, y, x + w, y + h, raio)
  ctx.arcTo(x + w, y + h, x, y + h, raio)
  ctx.arcTo(x, y + h, x, y, raio)
  ctx.arcTo(x, y, x + w, y, raio)
  ctx.closePath()
}

function desenharPad() {
  const W = pad.clientWidth
  const H = pad.clientHeight
  ctx.clearRect(0, 0, W, H)

  if (!minhaVez()) {
    ctx.fillStyle = 'rgba(0,0,0,.38)'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = 'rgba(243,244,251,.9)'
    ctx.font = '700 18px system-ui,sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(faseJogo === 'gameover' ? 'Fim de jogo' : `Aguarde a vez do Jogador ${vezAtual}`, W / 2, H / 2)
    return
  }

  if (modoPosicionar) {
    const r = tableRect()
    ctx.fillStyle = '#136534'
    retangulo(r.x, r.y, r.w, r.h, 10); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,.9)'
    ctx.font = '600 14px system-ui,sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Toque na mesa para posicionar a branca', W / 2, r.y - 10)
    return
  }

  const cx = W / 2
  const cy = H / 2
  ctx.fillStyle = 'rgba(255,255,255,.28)'
  ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill()

  if (arrastando && inicio && atual) {
    const { angle, power } = calc()
    ctx.strokeStyle = 'rgba(255,255,255,.35)'
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(inicio.x, inicio.y); ctx.lineTo(atual.x, atual.y); ctx.stroke()

    const len = Math.min(W, H) * 0.42 * power
    ctx.strokeStyle = `rgba(154,107,255,${0.5 + power * 0.5})`
    ctx.lineWidth = 7; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len); ctx.stroke()

    ctx.fillStyle = 'rgba(255,255,255,.85)'
    ctx.font = '700 16px system-ui,sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`Força ${Math.round(power * 100)}%`, cx, H - 14)
  } else {
    ctx.fillStyle = 'rgba(243,244,251,.5)'
    ctx.font = '600 15px system-ui,sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('Arraste para trás e solte para tacar', cx, cy + Math.min(W, H) * 0.3)
  }
}

// ----------------------------------------------------- manter a tela acesa
let trava = null
async function manterTelaAcesa() {
  if (!('wakeLock' in navigator)) return
  try {
    trava = await navigator.wakeLock.request('screen')
    trava.addEventListener('release', () => { trava = null })
  } catch { trava = null }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && trava === null) manterTelaAcesa()
})

// Já entrou pelo lobby como Jogador 2? Vai direto ao pad, sem passar pela
// aparência (a mesa quem escolhe é o Jogador 1).
if (meuPlayer === 2) irParaPad()
atualizarCabecalho()

connect()
