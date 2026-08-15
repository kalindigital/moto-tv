import { collideElastic, reflectCushion, stepBall } from '../shared/billiards.js'
import { initialState, resolveShot } from '../shared/pool-rules.js'
import { parseMessage, serializeTurn, serializeAssign } from '../shared/cue-protocol.js'
import { MESA, MESAS, TACOS, bounds, pockets, criarLayout, desenhar } from './mesa.js'
import { criarSons } from './audio.js'

/**
 * Sinuca (8-ball) para Android TV — top view em Canvas 2D.
 *
 * Estados de tela: espera -> mirando <-> simulando -> fim.
 * Entrada: WebSocket do celular (aim/shoot/place estilingue) com o d-pad da TV
 * como alternativa. A física vem de shared/billiards.js e as regras de
 * shared/pool-rules.js — este arquivo só orquestra, desenha e sonoriza.
 */

// ------------------------------------------------------------------ ajustes
// Física calibrada para "rolar e desacelerar" de forma fluida: velocidade de
// tacada moderada, atrito de rolamento suave e um limiar de parada bem baixo,
// para a bola deslizar até parar em vez de travar de repente.
const MAX_SPEED = 460      // velocidade da branca com força máxima (u/s)
const DECEL = 155          // atrito de rolamento (u/s²) — quanto menor, mais ela desliza
const MINSPEED = 1.6       // abaixo disso a bola para de vez (baixo = parada macia)
const REST_BOLA = 0.965    // restituição bola↔bola (quase elástica)
const CABECA = { x: MESA.W * 0.25, y: MESA.H / 2 }

const limites = bounds()
const pocs = pockets()
const sons = criarSons()

// ------------------------------------------------------------------- estado
let fase = 'espera'                 // espera | mirando | simulando | fim
let balls = []
let regras = initialState()
let aim = { ativo: false, angle: 0, power: 0.5 }
let qrAberto = false
let aparencia = { felt: MESAS.verde, tacoCor: TACOS.classico }
let caindo = []          // bolas em animação de queda na caçapa
const DUR_QUEDA = 0.34   // segundos da animação
// Modo 2 celulares: cada slot guarda o id do controle daquele jogador (ou null,
// quando aquele jogador ainda não escaneou — aí qualquer controle pode jogar).
const controladores = { 1: null, 2: null }
const vistoEm = {}            // id → instante do último sinal de vida
const VAGA_OCIOSA_MS = 8000   // sem batimento por tanto tempo, a vaga é reciclada

// trackers de uma tacada
let firstContact = null
let contato = false
let railAposContato = false
let pottedThisShot = []
let cuePotted = false

// ---------------------------------------------------------------------- DOM
const el = (id) => document.getElementById(id)
const canvas = el('mesa')
const ctx = canvas.getContext('2d')
const telas = { espera: el('telaEspera'), fim: el('telaFim') }
let layout

function dimensionar() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.floor(window.innerWidth * dpr)
  canvas.height = Math.floor(window.innerHeight * dpr)
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  layout = criarLayout(canvas.width, canvas.height)
}
dimensionar()
window.addEventListener('resize', dimensionar)

function mostrarTela(nome) {
  for (const chave of Object.keys(telas)) telas[chave].classList.toggle('oculto', chave !== nome)
}

// -------------------------------------------------------------- montar bolas
function embaralhar(a) {
  const b = a.slice()
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

function novaBola(id, x, y) {
  return { id, x, y, vx: 0, vy: 0, r: MESA.r, potted: false }
}

function montarBolas() {
  const lista = [novaBola(0, CABECA.x, CABECA.y)]
  const apexX = MESA.W * 0.70
  const cy = MESA.H / 2
  const d = MESA.r * 2 + 0.15         // espaçamento (bolas encostadas)
  const dx = d * Math.sqrt(3) / 2     // altura entre linhas do triângulo
  const outros = embaralhar([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15])
  let k = 0
  for (let lin = 0; lin < 5; lin++) {
    for (let i = 0; i <= lin; i++) {
      const id = (lin === 2 && i === 1) ? 8 : outros[k++]  // a 8 no centro do triângulo
      lista.push(novaBola(id, apexX + lin * dx, cy + (i - lin / 2) * d))
    }
  }
  return lista
}

// --------------------------------------------------------------- posições
function livre(x, y, ignoreId) {
  if (x < limites.left || x > limites.right || y < limites.top || y > limites.bottom) return false
  for (const b of balls) {
    if (b.potted || b.id === ignoreId) continue
    if (Math.hypot(b.x - x, b.y - y) < MESA.r * 2 + 0.2) return false
  }
  return true
}

function posicionarBrancaLivre(x, y) {
  const cue = balls[0]
  cue.potted = false
  if (livre(x, y, 0)) { cue.x = x; cue.y = y; return }
  for (let raio = MESA.r; raio < MESA.W; raio += MESA.r) {
    for (let a = 0; a < 360; a += 30) {
      const nx = x + Math.cos(a * Math.PI / 180) * raio
      const ny = y + Math.sin(a * Math.PI / 180) * raio
      if (livre(nx, ny, 0)) { cue.x = nx; cue.y = ny; return }
    }
  }
  cue.x = x; cue.y = y
}

// ------------------------------------------------------------------ partida
function iniciarPartida() {
  balls = montarBolas()
  regras = initialState()          // vez 1, mesa aberta, quebra
  regras.reason = 'Quebra!'
  aim = { ativo: false, angle: 0, power: 0.5 }
  caindo = []
  fase = 'mirando'
  qrAberto = false
  el('hud').classList.remove('oculto')
  mostrarTela(null)
  atualizarHud()
  enviarTurno()
}

function comecarSeNecessario() {
  if (fase === 'espera') iniciarPartida()
}

function reiniciar() { iniciarPartida() }

// -------------------------------------------------------------------- tacada
function tacar(angle, power) {
  if (fase !== 'mirando') return
  const cue = balls[0]
  if (cue.potted) return
  const v = Math.max(0, Math.min(1, power)) * MAX_SPEED
  if (v <= 0) return
  cue.vx = Math.cos(angle) * v
  cue.vy = Math.sin(angle) * v
  firstContact = null
  contato = false
  railAposContato = false
  pottedThisShot = []
  cuePotted = false
  regras.ballInHand = false
  aim.ativo = false
  sons.taco(power)
  fase = 'simulando'
}

function pocketMaisProxima(x, y) {
  let melhor = pocs[0]
  let dist = Infinity
  for (const p of pocs) {
    const d = Math.hypot(x - p.x, y - p.y)
    if (d < dist) { dist = d; melhor = p }
  }
  return melhor
}

function encacapar(b) {
  if (b.potted) return
  b.potted = true
  b.vx = 0
  b.vy = 0
  sons.cacapa()
  // registra a animação de queda: a bola desliza até o centro da caçapa e some
  const p = pocketMaisProxima(b.x, b.y)
  caindo.push({ id: b.id, x: b.x, y: b.y, px: p.x, py: p.y, t: 0 })
  if (b.id === 0) cuePotted = true
  else pottedThisShot.push(b.id)
}

function subPasso(dt, ativos) {
  for (const b of ativos) {
    if (b.potted) continue
    const vAntes = Math.hypot(b.vx, b.vy)
    stepBall(b, dt, DECEL, MINSPEED)

    let naBoca = false
    for (const p of pocs) {
      const dpoc = Math.hypot(b.x - p.x, b.y - p.y)
      if (dpoc < MESA.captura) { encacapar(b); naBoca = true; break }
      if (dpoc < MESA.boca) naBoca = true
    }
    if (b.potted) continue

    if (!naBoca && reflectCushion(b, limites, MESA.restituicao)) {
      if (contato) railAposContato = true
      sons.tabela(Math.min(1, vAntes / MAX_SPEED))
    }

    // rede de segurança: se por acaso escapou da mesa, engole
    if (b.x < -MESA.r * 2 || b.x > MESA.W + MESA.r * 2 ||
        b.y < -MESA.r * 2 || b.y > MESA.H + MESA.r * 2) encacapar(b)
  }

  for (let i = 0; i < ativos.length; i++) {
    const a = ativos[i]
    if (a.potted) continue
    for (let j = i + 1; j < ativos.length; j++) {
      const c = ativos[j]
      if (c.potted) continue
      const vrel = Math.hypot(a.vx - c.vx, a.vy - c.vy)
      if (collideElastic(a, c, REST_BOLA)) {
        sons.bola(Math.min(1, vrel / MAX_SPEED))
        if (!contato && (a.id === 0 || c.id === 0)) {
          firstContact = (a.id === 0 ? c : a).id
          contato = true
        }
      }
    }
  }
}

function simular(dt) {
  const ativos = balls.filter((b) => !b.potted)
  let maxV = 0
  for (const b of ativos) maxV = Math.max(maxV, Math.hypot(b.vx, b.vy))
  if (maxV === 0) { finalizarTacada(); return }
  // sub-passos para não atravessar bolas em alta velocidade
  const passos = Math.min(48, Math.max(1, Math.ceil((maxV * dt) / (MESA.r * 0.4))))
  const sub = dt / passos
  for (let s = 0; s < passos; s++) subPasso(sub, ativos)
}

function contarRestantes() {
  let solids = 0
  let stripes = 0
  for (const b of balls) {
    if (b.potted) continue
    if (b.id >= 1 && b.id <= 7) solids++
    else if (b.id >= 9 && b.id <= 15) stripes++
  }
  return { solids, stripes }
}

function finalizarTacada() {
  const shot = {
    potted: pottedThisShot.slice(),
    cuePotted,
    firstContact,
    railAfterContact: railAposContato,
    remaining: contarRestantes(),
  }
  regras = resolveShot(regras, shot)

  if (regras.phase === 'gameover') {
    fase = 'fim'
    el('fimTitulo').textContent = `Jogador ${regras.winner} venceu!`
    el('fimSub').textContent = regras.reason || ''
    el('hud').classList.add('oculto')
    mostrarTela('fim')
    enviarTurno()
    return
  }

  // scratch: recoloca a branca no ponto da cabeça (o adversário ganha bola na mão)
  if (cuePotted) posicionarBrancaLivre(CABECA.x, CABECA.y)

  fase = 'mirando'
  atualizarHud()
  enviarTurno()
}

// --------------------------------------------------- lobby de 2 celulares
// Só o controle "dono" da vez pode jogar; se aquele jogador ainda não entrou
// (slot null), qualquer controle joga — assim um celular só também funciona.
function podeJogar(id) {
  const dono = controladores[regras.turn]
  return dono == null || id == null || dono === id
}

function onJoin(id) {
  if (id == null) return
  const agora = performance.now()
  vistoEm[id] = agora

  if (controladores[1] !== id && controladores[2] !== id) {
    if (controladores[1] == null) controladores[1] = id
    else if (controladores[2] == null) controladores[2] = id
    else {
      // Ambas as vagas ocupadas: fica com a de quem parou de dar sinal (saiu ou
      // recarregou a página, voltando com outro id). Senão, ignora o extra.
      const ocioso = (slot) => agora - (vistoEm[controladores[slot]] || 0) > VAGA_OCIOSA_MS
      if (ocioso(1)) controladores[1] = id
      else if (ocioso(2)) controladores[2] = id
      else return
    }
  }
  const player = controladores[1] === id ? 1 : 2
  enviar(serializeAssign(id, player))
  atualizarEspera()
  enviarTurno()
}

function atualizarEspera() {
  const status = el('esperaStatus')
  if (!status) return
  const n = (controladores[1] ? 1 : 0) + (controladores[2] ? 1 : 0)
  if (n === 0) status.textContent = 'Escaneie o QR para entrar como Jogador 1'
  else if (n === 1) status.textContent = '✓ Jogador 1 pronto — Jogador 2, escaneie o mesmo QR (ou comece sozinho)'
  else status.textContent = '✓ Jogadores 1 e 2 prontos — Jogador 1, escolha a mesa e comece'
}

// ------------------------------------------------------------------- entrada
function onAim(angle, power, id) {
  if (!podeJogar(id)) return
  sons.liberar()
  comecarSeNecessario()
  if (fase !== 'mirando') return
  aim = { ativo: true, angle, power }
}

function onShoot(angle, power, id) {
  if (!podeJogar(id)) return
  sons.liberar()
  comecarSeNecessario()
  tacar(angle, power)
}

function onPlace(nx, ny, id) {
  if (!podeJogar(id)) return
  if (!regras.ballInHand || fase !== 'mirando') return
  const x = MESA.r + nx * (MESA.W - 2 * MESA.r)
  const y = MESA.r + ny * (MESA.H - 2 * MESA.r)
  if (livre(x, y, 0)) { balls[0].x = x; balls[0].y = y; balls[0].potted = false }
}

function comando(nome) {
  if (nome === 'restart') reiniciar()
  else if (nome === 'qr') alternarQr()
  else if (nome === 'menu') location.href = '/menu/index.html'
}

function aplicarAparencia(taco, mesa) {
  aparencia = { felt: MESAS[mesa] || MESAS.verde, tacoCor: TACOS[taco] || TACOS.classico }
}

// ----------------------------------------------------------------------- QR
function alternarQr() {
  qrAberto = !qrAberto
  el('telaQr').classList.toggle('oculto', !qrAberto)
}

// -------------------------------------------------------------------- HUD
const nomeGrupo = (g) => (g === 'solid' ? 'Lisas' : g === 'stripe' ? 'Listradas' : 'Mesa aberta')

function atualizarHud() {
  el('vez').textContent = `Jogador ${regras.turn}`
  el('grupo').textContent = regras.open ? 'Mesa aberta' : nomeGrupo(regras.groups[regras.turn])
  el('recado').textContent = regras.reason || ''
  el('bih').classList.toggle('oculto', !regras.ballInHand)
  document.body.dataset.jogador = String(regras.turn)
}

// ------------------------------------------------------------- turno → celular
let socket = null

function enviar(msg) {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(msg)
}

function enviarTurno() {
  enviar(serializeTurn({
    player: regras.turn,
    group: regras.open ? null : regras.groups[regras.turn],
    ballInHand: regras.ballInHand,
    // 'espera' avisa o celular que a partida ainda não começou (Jogador 1
    // escolhe a aparência); depois vale a fase das regras.
    phase: fase === 'espera' ? 'espera' : regras.phase,
    winner: regras.winner,
    controllerId: controladores[regras.turn],   // celular dono da vez (ou null)
  }))
}

// ------------------------------------------------------------------ WebSocket
function connectWs() {
  socket = new WebSocket(`wss://${location.host}/ws`)
  socket.onopen = () => enviarTurno()
  socket.onmessage = (ev) => {
    const m = parseMessage(ev.data)
    // 'pick' só registra o controle (a TV já navegou até aqui); o jogo começa
    // quando a aparência é confirmada ou na primeira mira/tacada.
    if (m.type === 'pick' && m.game === 'sinuca') enviarTurno()
    else if (m.type === 'join') onJoin(m.id)
    else if (m.type === 'sinucaSetup') { aplicarAparencia(m.taco, m.mesa); comecarSeNecessario() }
    else if (m.type === 'aim') onAim(m.angle, m.power, m.id)
    else if (m.type === 'shoot') onShoot(m.angle, m.power, m.id)
    else if (m.type === 'place') onPlace(m.x, m.y, m.id)
    else if (m.type === 'action') comando(m.name)
  }
  socket.onclose = () => setTimeout(connectWs, 1000)
  socket.onerror = () => socket.close()
}
connectWs()

// ------------------------------------------------- teclado (controle da TV / dev)
const PASSO_MIRA = 0.05
const PASSO_FORCA = 0.08

addEventListener('keydown', (e) => {
  sons.liberar()
  if (e.key === 'ArrowLeft') { aim.ativo = true; aim.angle -= PASSO_MIRA; comecarSeNecessario() }
  else if (e.key === 'ArrowRight') { aim.ativo = true; aim.angle += PASSO_MIRA; comecarSeNecessario() }
  else if (e.key === 'ArrowUp') { aim.ativo = true; aim.power = Math.min(1, aim.power + PASSO_FORCA) }
  else if (e.key === 'ArrowDown') { aim.ativo = true; aim.power = Math.max(0.05, aim.power - PASSO_FORCA) }
  else if (e.key === 'Enter') {
    if (atualizacao && !atualizando) { iniciarAtualizacao(); return }
    if (fase === 'espera') iniciarPartida()
    else if (fase === 'fim') reiniciar()
    else if (fase === 'mirando') tacar(aim.angle, aim.power)
  } else if (e.key === 'r' || e.key === 'R') {
    reiniciar()
  } else if (e.key === 'q' || e.key === 'Q') {
    alternarQr()
  }
})

// ---------------------------------------------------------- config/QR + update
fetch('/config')
  .then((r) => r.json())
  .then((cfg) => {
    if (!cfg || !cfg.controllerUrl || typeof QRCode !== 'function') return
    for (const id of ['qrEspera', 'qrPedido']) {
      // eslint-disable-next-line no-new
      new QRCode(el(id), { text: cfg.controllerUrl, width: 200, height: 200 })
    }
  })
  .catch(() => {})

let atualizacao = null
let atualizando = false
let tentativasUpdate = 0

function mostrarBanner(texto) {
  const b = el('update')
  b.textContent = texto
  b.classList.remove('oculto')
}

function checarAtualizacao() {
  fetch('/update')
    .then((r) => r.json())
    .then((u) => {
      if (u && u.disponivel) {
        atualizacao = u
        mostrarBanner(`Nova versão ${u.versao} disponível — pressione OK para atualizar`)
        return
      }
      if (++tentativasUpdate < 6) setTimeout(checarAtualizacao, 5000)
    })
    .catch(() => { if (++tentativasUpdate < 6) setTimeout(checarAtualizacao, 5000) })
}

function iniciarAtualizacao() {
  if (!window.MotoTV || typeof window.MotoTV.baixarAtualizacao !== 'function') return
  atualizando = true
  mostrarBanner('Baixando atualização… 0%')
  window.MotoTV.baixarAtualizacao()
}
window.__updateProgress = (pct) => mostrarBanner(`Baixando atualização… ${pct}%`)
window.__updateFalhou = () => { atualizando = false; mostrarBanner('Falha ao baixar — pressione OK para tentar de novo') }
checarAtualizacao()

// -------------------------------------------------------------------- loop
let ultimo = performance.now()

function frame(agora) {
  const dt = Math.min((agora - ultimo) / 1000, 0.05)
  ultimo = agora

  if (fase === 'simulando') simular(dt)

  // avança a animação das bolas caindo e descarta as que terminaram
  if (caindo.length) {
    for (const c of caindo) c.t += dt / DUR_QUEDA
    caindo = caindo.filter((c) => c.t < 1)
  }

  const cue = balls[0]
  desenhar(ctx, layout, {
    balls,
    aim: (fase === 'mirando' && cue && !cue.potted)
      ? { ativo: aim.ativo, angle: aim.angle, power: aim.power, x: cue.x, y: cue.y }
      : { ativo: false },
    ballInHand: regras.ballInHand,
    mesaAberta: regras.open,
    felt: aparencia.felt,
    tacoCor: aparencia.tacoCor,
    caindo,
  })
  requestAnimationFrame(frame)
}

// primeira pintura já mostra a mesa montada atrás da tela de espera
balls = montarBolas()
requestAnimationFrame(frame)
