import * as THREE from '../vendor/three.module.js'
import { aabbOverlap } from '../shared/collision.js'
import { parseMessage } from '../shared/protocol.js'
import {
  criarPlacar, registrarUltrapassagem, inserirNoRanking, ehRecorde, formatarPontos,
} from '../shared/scoring.js'
import {
  carregarModelos, criarMoto, girarRodas, descartarMoto, pegarCarro, pegarCaminhao,
} from './models.js'
import { criarCenario, FAIXAS, LIMITE_X } from './cenario.js'
import { criarMotor } from './audio.js'

/**
 * Moto TV — tela do jogo.
 *
 * Estados: carregando -> aguardando -> jogando <-> pausado -> crashed.
 * Entrada: WebSocket do celular (steer/throttle/setup/action) com teclado como
 * alternativa para o controle da TV e para desenvolvimento.
 */

// ------------------------------------------------------------------ ajustes
const VEL_INICIAL = 26          // unidades de mundo por segundo
const VEL_CRUZEIRO = 34
const VEL_TURBO = 60
const VEL_TRAFEGO = 7           // trafego anda no mesmo sentido, mais devagar: a moto alcanca
const VEL_LATERAL = 7.2
const KMH_POR_UNIDADE = 5       // só para o velocímetro parecer de moto
const Z_SPAWN = -110
const Z_SUMICO = 14
const CHAVE_RANKING = 'moto-tv.ranking'

// ------------------------------------------------------------------- estado
let estado = 'carregando'
let steer = 0                   // -1..1 vindo do celular ou do teclado
let acelerando = false
let alvoX = 0
let velocidade = VEL_INICIAL
let tempoCorrida = 0
let tempoSpawn = 0
let placar = criarPlacar()
let periodo = 'dia'
let motoEscolhida = 'classica'  // id da moto pedido pelo celular (setup.moto)
let trocandoMoto = false        // um swap de moto em andamento (evita duplicar)
let qrAberto = false

// ------------------------------------------------------------------ cena 3D
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 260)
// TV tem GPU fraca: antialias (MSAA) e pixel ratio alto eram o maior custo daqui.
// Renderizamos abaixo da resolução da tela e deixamos o próprio painel esticar a
// imagem — o ganho de FPS é grande e a perda visual, pequena a alguns metros.
const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: 'high-performance',
})
renderer.shadowMap.enabled = false
let escalaRender = Number(localStorage.getItem('moto-tv.escala.v3')) || 1

function dimensionar() {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(1)
  renderer.setSize(
    Math.max(320, Math.round(innerWidth * escalaRender)),
    Math.max(180, Math.round(innerHeight * escalaRender)),
    false,
  )
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
}
dimensionar()
document.getElementById('palco').appendChild(renderer.domElement)
addEventListener('resize', dimensionar)

let cenario = null
let moto = null
const veiculos = []             // pool: nada é criado durante a partida

// --------------------------------------------------------------------- DOM
const el = (id) => document.getElementById(id)
const telas = {
  carregando: el('telaCarregando'),
  espera: el('telaEspera'),
  pausa: el('telaPausa'),
  fim: el('telaFim'),
}
const hud = el('hud')
const elPontos = el('pontos')
const elDetalhe = el('detalhe')
const elVelocidade = el('velocidade')
const elAcelerador = el('acelerador')
const elBarraAcel = el('barraAcel')
const elPeriodo = el('periodo')
const telaQr = el('telaQr')

function mostrarTela(nome) {
  for (const chave of Object.keys(telas)) telas[chave].classList.toggle('oculto', chave !== nome)
}

// Pool de "+1"/"+4": elementos reciclados, zero alocação durante o jogo.
const flutuantes = []
{
  const caixa = el('flutuantes')
  for (let i = 0; i < 8; i++) {
    const span = document.createElement('div')
    span.className = 'flutuante'
    caixa.appendChild(span)
    flutuantes.push(span)
  }
}
let proximoFlutuante = 0
const _tela = new THREE.Vector3()

function pontoFlutuante(texto, objeto) {
  const span = flutuantes[proximoFlutuante]
  proximoFlutuante = (proximoFlutuante + 1) % flutuantes.length
  _tela.setFromMatrixPosition(objeto.matrixWorld).project(camera)
  span.textContent = texto
  span.style.left = `${(_tela.x * 0.5 + 0.5) * innerWidth}px`
  span.style.top = `${(-_tela.y * 0.5 + 0.5) * innerHeight}px`
  span.classList.remove('anima')
  void span.offsetWidth        // reinicia a animação CSS
  span.classList.add('anima')
}

// ------------------------------------------------------------------ ranking
function dataCurta() {
  const d = new Date()
  const dois = (n) => String(n).padStart(2, '0')
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** Lê o top 10 do localStorage; JSON corrompido ou storage bloqueado vira []. */
function lerRanking() {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE_RANKING) || '[]')
    if (!Array.isArray(bruto)) return []
    return bruto
      .filter((e) => e && typeof e.pontos === 'number' && Number.isFinite(e.pontos) && e.pontos >= 0)
      .map((e) => ({ pontos: Math.floor(e.pontos), data: typeof e.data === 'string' ? e.data : '' }))
      .sort((a, b) => b.pontos - a.pontos)
      .slice(0, 10)
  } catch (e) {
    return []
  }
}

function salvarRanking(lista) {
  try {
    localStorage.setItem(CHAVE_RANKING, JSON.stringify(lista))
  } catch (e) { /* modo privado / storage cheio: o jogo segue sem ranking */ }
}

function desenharRanking(lista, entradaNova) {
  const ol = el('fimRanking')
  ol.innerHTML = ''
  if (lista.length === 0) {
    const li = document.createElement('li')
    li.className = 'vazio'
    li.textContent = 'Sem corridas registradas ainda'
    ol.appendChild(li)
    return
  }
  lista.forEach((entrada, i) => {
    const li = document.createElement('li')
    if (entrada === entradaNova) li.className = 'novo'
    li.innerHTML = `<span class="pos">${i + 1}º</span>` +
      `<span class="pts">${formatarPontos(entrada.pontos)}</span>` +
      `<span class="quando">${entrada.data || ''}</span>`
    ol.appendChild(li)
  })
}

// -------------------------------------------------------------------- áudio
const motor = criarMotor()
let audioLiberado = false

/** A política de autoplay exige um gesto: o primeiro comando serve de gesto. */
function liberarAudio() {
  if (audioLiberado) return
  audioLiberado = true
  motor.iniciar()
  motor.setIntensidade(0)
}

// --------------------------------------------------------------- pool de 3D
function montarPool() {
  const montar = (pegar) => {
    const v = pegar()
    if (!v) return
    v.objeto.visible = false
    v.objeto.position.set(0, 0, Z_SPAWN)
    scene.add(v.objeto)
    veiculos.push({ ...v, ativo: false, faixa: 0, contado: false })
  }
  for (let i = 0; i < 9; i++) montar(pegarCarro)
  for (let i = 0; i < 5; i++) montar(pegarCaminhao)
}

/**
 * Escolhe uma faixa livre deixando SEMPRE ao menos uma saída: se só sobrar uma
 * faixa vaga, o spawn é adiado. Sem isso a dificuldade viraria sorte.
 */
function faixaParaSpawn() {
  const ocupadas = [false, false, false]
  for (const v of veiculos) {
    if (v.ativo && v.objeto.position.z < Z_SPAWN + 42) ocupadas[v.faixa] = true
  }
  const livres = []
  for (let i = 0; i < FAIXAS.length; i++) if (!ocupadas[i]) livres.push(i)
  if (livres.length <= 1) return -1
  return livres[(Math.random() * livres.length) | 0]
}

function soltarVeiculo() {
  const faixa = faixaParaSpawn()
  if (faixa < 0) return
  // 1 caminhão a cada ~4 veículos: são maiores e fecham muito mais a faixa.
  const querCaminhao = Math.random() < 0.26
  let escolhido = null
  for (const v of veiculos) {
    if (v.ativo) continue
    if (querCaminhao === (v.tipo === 'caminhao')) { escolhido = v; break }
    if (!escolhido) escolhido = v
  }
  if (!escolhido) return
  escolhido.ativo = true
  escolhido.contado = false
  escolhido.faixa = faixa
  escolhido.objeto.visible = true
  escolhido.objeto.position.set(FAIXAS[faixa], 0, Z_SPAWN)
}

function recolherVeiculos() {
  for (const v of veiculos) {
    v.ativo = false
    v.contado = false
    v.objeto.visible = false
    v.objeto.position.z = Z_SPAWN
  }
}

/**
 * Troca a moto do jogador pela que o celular escolheu. Só acontece nas telas
 * paradas (espera/fim) — no meio da corrida a moto atual segue. A antiga é
 * descartada (removida da cena e devolvida à GPU) antes de a nova entrar, então
 * há sempre uma só moto viva. Como criarMoto é assíncrona (o GLB pode pesar 1
 * MB), o laço reconfere no fim: se o jogador trocou de novo durante a carga,
 * carrega a última escolha — sem empilhar swaps nem deixar moto órfã.
 */
async function trocarMoto(id) {
  motoEscolhida = id
  if (estado !== 'aguardando' && estado !== 'crashed') return
  if (trocandoMoto) return
  if (moto && moto.userData.moto === id) return
  trocandoMoto = true
  try {
    let alvo
    do {
      alvo = motoEscolhida
      const nova = await criarMoto(alvo)
      if (moto) descartarMoto(moto)
      moto = nova
      moto.position.set(0, 0, 0)
      moto.rotation.set(0, 0, 0)
      scene.add(moto)
      cenario.farolMoto = moto.userData.farol
      cenario.definirPeriodo(periodo)   // reacende o farol conforme dia/noite
    } while (alvo !== motoEscolhida && (estado === 'aguardando' || estado === 'crashed'))
  } finally {
    trocandoMoto = false
  }
}

// ----------------------------------------------------------------- estados
function irParaEspera() {
  estado = 'aguardando'
  hud.classList.add('oculto')
  mostrarTela('espera')
  motor.setIntensidade(0)
  motor.pausar()
}

function comecar() {
  recolherVeiculos()
  placar = criarPlacar()
  velocidade = VEL_INICIAL
  tempoCorrida = 0
  tempoSpawn = 0
  alvoX = 0
  steer = 0
  acelerando = false
  if (moto) {
    moto.position.x = 0
    moto.rotation.set(0, 0, 0)
  }
  atualizarHud(true)
  estado = 'jogando'
  hud.classList.remove('oculto')
  mostrarTela(null)
  fecharQr()
  cenario.definirEscurecido(false)
  liberarAudio()
  motor.retomar()
}

function pausar() {
  if (estado !== 'jogando') return
  estado = 'pausado'
  mostrarTela('pausa')
  cenario.definirEscurecido(true)
  motor.pausar()
}

function retomar() {
  if (estado !== 'pausado') return
  estado = 'jogando'
  mostrarTela(null)
  cenario.definirEscurecido(false)
  motor.retomar()
}

function bater() {
  estado = 'crashed'
  motor.setIntensidade(0)
  motor.pausar()
  if (moto) moto.rotation.z = 0.85   // a moto deita no chão

  const anterior = lerRanking()
  const recorde = ehRecorde(anterior, placar.pontos)
  const entrada = { pontos: placar.pontos, data: dataCurta() }
  const atualizado = inserirNoRanking(anterior, entrada, 10)
  salvarRanking(atualizado)

  el('fimPontos').textContent = formatarPontos(placar.pontos)
  el('fimDetalhe').textContent = textoDetalhe()
  el('fimRecorde').classList.toggle('oculto', !recorde)
  desenharRanking(atualizado, entrada)

  hud.classList.add('oculto')
  fecharQr()
  mostrarTela('fim')
}

function definirPeriodo(novo) {
  if (novo !== 'dia' && novo !== 'noite') return
  periodo = novo
  cenario.definirPeriodo(novo)
  elPeriodo.textContent = novo === 'noite' ? '🌙 Noite' : '☀ Dia'
}

// ---------------------------------------------------------------------- QR
function abrirQr() {
  qrAberto = true
  telaQr.classList.remove('oculto')
}
function fecharQr() {
  qrAberto = false
  telaQr.classList.add('oculto')
}
function alternarQr() {
  if (qrAberto) fecharQr(); else abrirQr()
}

// -------------------------------------------------------------------- HUD
let hudPontos = -1
let hudVelocidade = -1

function textoDetalhe() {
  const c = placar.carros
  const t = placar.caminhoes
  return `${c} ${c === 1 ? 'carro' : 'carros'} · ${t} ${t === 1 ? 'caminhão' : 'caminhões'}`
}

/** Só escreve no DOM quando o número muda: texto por frame trava layout na TV. */
function atualizarHud(forcar) {
  if (forcar || placar.pontos !== hudPontos) {
    hudPontos = placar.pontos
    elPontos.textContent = formatarPontos(placar.pontos)
    elDetalhe.textContent = textoDetalhe()
  }
  const kmh = Math.round(velocidade * KMH_POR_UNIDADE)
  if (forcar || kmh !== hudVelocidade) {
    hudVelocidade = kmh
    elVelocidade.textContent = String(kmh)
    const fracao = Math.max(0, Math.min(1, (velocidade - VEL_INICIAL) / (VEL_TURBO - VEL_INICIAL)))
    elBarraAcel.style.width = `${Math.round(fracao * 100)}%`
  }
  elAcelerador.classList.toggle('ativo', acelerando)
}

// ------------------------------------------------- banner de atualização
// A checagem no GitHub roda em paralelo ao start do servidor e pode terminar
// depois desta página carregar; por isso a consulta se repete algumas vezes.
let atualizacao = null      // { versao, changelog } quando há versão nova
let atualizando = false     // download em andamento (o banner para de aceitar OK)
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
      reagendarChecagem()
    })
    .catch(reagendarChecagem)
}

function reagendarChecagem() {
  tentativasUpdate += 1
  if (tentativasUpdate < 6) setTimeout(checarAtualizacao, 5000)
}

function iniciarAtualizacao() {
  // A ponte só existe dentro do app Android; no navegador o banner é informativo.
  if (!window.MotoTV || typeof window.MotoTV.baixarAtualizacao !== 'function') return
  atualizando = true
  mostrarBanner('Baixando atualização… 0%')
  window.MotoTV.baixarAtualizacao()
}

// Chamadas pelo app (WebView.evaluateJavascript) durante o download.
window.__updateProgress = (pct) => mostrarBanner(`Baixando atualização… ${pct}%`)
window.__updateFalhou = () => {
  atualizando = false
  mostrarBanner('Falha ao baixar a atualização — pressione OK para tentar de novo')
}

checarAtualizacao()

// --------------------------------------------------------------- config/QR
fetch('/config')
  .then((r) => r.json())
  .then((cfg) => {
    if (!cfg || !cfg.controllerUrl || typeof QRCode !== 'function') return
    // Dois códigos: o da tela de espera e o do overlay sob demanda.
    for (const id of ['qrEspera', 'qrPedido']) {
      // eslint-disable-next-line no-new
      new QRCode(el(id), { text: cfg.controllerUrl, width: 200, height: 200 })
    }
  })
  .catch(() => {})

// ----------------------------------------------------------------- comandos
function comando(nome) {
  liberarAudio()
  if (estado === 'carregando') return
  if (nome === 'restart') { comecar(); return }
  if (nome === 'pause') { pausar(); return }
  if (nome === 'resume') { retomar(); return }
  if (nome === 'qr') alternarQr()
}

/** Qualquer entrada de direção/acelerador na tela de espera já larga a corrida. */
function talvezComecar() {
  if (estado === 'aguardando') comecar()
}

function connectWs() {
  const ws = new WebSocket(`wss://${location.host}/ws`)
  ws.onmessage = (ev) => {
    const m = parseMessage(ev.data)
    if (m.type === 'steer') {
      liberarAudio()
      steer = m.value
      talvezComecar()
    } else if (m.type === 'throttle') {
      liberarAudio()
      acelerando = m.ativo
      talvezComecar()
    } else if (m.type === 'setup') {
      if (estado !== 'carregando') {
        definirPeriodo(m.periodo)
        // moto ausente/desconhecida (null) usa a clássica, a padrão.
        trocarMoto(m.moto || 'classica')
      }
    } else if (m.type === 'action') {
      comando(m.name)
    }
  }
  ws.onclose = () => setTimeout(connectWs, 1000)
  ws.onerror = () => ws.close()
}
connectWs()

// -------------------------------------------- teclado (controle da TV / dev)
addEventListener('keydown', (e) => {
  liberarAudio()
  if (e.key === 'ArrowLeft') { steer = -1; talvezComecar() }
  else if (e.key === 'ArrowRight') { steer = 1; talvezComecar() }
  else if (e.key === 'ArrowUp' || e.key === ' ' || e.key === 'Spacebar') {
    acelerando = true
    talvezComecar()
  } else if (e.key === 'Enter') {
    // O OK do controle da TV chega como Enter. Enquanto houver atualização à
    // espera de confirmação, ele é do banner; depois volta a ser do jogo.
    // As setas (jogabilidade) nunca são tocadas por isso.
    if (atualizacao && !atualizando) { iniciarAtualizacao(); return }
    if (estado === 'aguardando' || estado === 'crashed') comecar()
    else if (estado === 'pausado') retomar()
  } else if (e.key === 'p' || e.key === 'P') {
    if (estado === 'pausado') retomar(); else pausar()
  } else if (e.key === 'q' || e.key === 'Q') {
    if (estado !== 'carregando') alternarQr()
  }
})

addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') steer = 0
  if (e.key === 'ArrowUp' || e.key === ' ' || e.key === 'Spacebar') acelerando = false
})

// -------------------------------------------------------------------- loop
let ultimo = performance.now()
let inclinacao = 0

function passo(dt) {
  tempoCorrida += dt

  // velocidade: sobe rápido no acelerador e volta ao cruzeiro ao soltar
  const cruzeiro = VEL_CRUZEIRO + Math.min(12, tempoCorrida * 0.32)
  const alvo = acelerando ? VEL_TURBO : cruzeiro
  velocidade += (alvo - velocidade) * Math.min(1, dt * (acelerando ? 0.9 : 1.6))

  // direção lateral suavizada + inclinação da moto na curva
  alvoX = Math.max(-LIMITE_X, Math.min(LIMITE_X, alvoX + steer * dt * VEL_LATERAL))
  moto.position.x += (alvoX - moto.position.x) * Math.min(1, dt * 10)
  inclinacao += (steer - inclinacao) * Math.min(1, dt * 8)
  moto.rotation.z = -inclinacao * 0.45
  moto.rotation.y = -inclinacao * 0.10

  cenario.atualizar(velocidade * dt)
  girarRodas(moto, velocidade * dt)   // rodas giram conforme a moto anda

  // tráfego: vem de frente, então a aproximação soma as duas velocidades
  const dzTrafego = Math.max(4, velocidade - VEL_TRAFEGO) * dt
  const caixaMoto = moto.userData.hitbox
  for (const v of veiculos) {
    if (!v.ativo) continue
    const o = v.objeto
    o.position.z += dzTrafego

    if (!v.contado && o.position.z > moto.position.z) {
      v.contado = true
      const antes = placar.pontos
      placar = registrarUltrapassagem(placar, v.tipo, acelerando)
      pontoFlutuante(`+${placar.pontos - antes}`, o)
    }

    if (o.position.z > Z_SUMICO) {
      v.ativo = false
      o.visible = false
      continue
    }

    const bateu = aabbOverlap(
      { x: moto.position.x, z: moto.position.z, w: caixaMoto.w, d: caixaMoto.d },
      { x: o.position.x, z: o.position.z, w: v.hitbox.w, d: v.hitbox.d },
    )
    if (bateu) { bater(); return }
  }

  // dificuldade: o intervalo entre veículos encurta com tempo e pontuação
  const intervalo = Math.max(0.38, 1.15 - tempoCorrida * 0.008 - placar.pontos * 0.004)
  tempoSpawn += dt
  if (tempoSpawn >= intervalo) { tempoSpawn = 0; soltarVeiculo() }

  motor.setIntensidade(Math.max(0, Math.min(1, (velocidade - VEL_INICIAL) / (VEL_TURBO - VEL_INICIAL))))
  atualizarHud(false)
}

const FOV_BASE = 70
const FOV_TURBO = 82

function frame(agora) {
  const dt = Math.min((agora - ultimo) / 1000, 0.05)
  ultimo = agora

  if (estado === 'jogando') passo(dt)

  if (moto) {
    // câmera em 3ª pessoa, atrás e um pouco acima, com folga na lateral
    const alvoCamX = moto.position.x * 0.62
    camera.position.x += (alvoCamX - camera.position.x) * Math.min(1, dt * 5)
    camera.position.y = 2.7
    camera.position.z = 6.0
    camera.lookAt(moto.position.x * 0.4, 1.15, -14)

    const fovAlvo = estado === 'jogando' && acelerando ? FOV_TURBO : FOV_BASE
    if (Math.abs(camera.fov - fovAlvo) > 0.05) {
      camera.fov += (fovAlvo - camera.fov) * Math.min(1, dt * 3)
      camera.updateProjectionMatrix()
    }
  }

  renderer.render(scene, camera)
  medirFps(agora)
  requestAnimationFrame(frame)
}

// ---------------------------------------------------- FPS + qualidade adaptativa
// A TV não tem teclado: o contador fica sempre visível. Se o FPS ficar baixo por
// alguns segundos, reduzimos a escala de renderização sozinhos (e guardamos a
// escolha, para a próxima abertura já começar no ponto certo).
const painelFps = document.createElement('div')
painelFps.style.cssText =
  'position:fixed;top:10px;right:14px;z-index:60;font:600 13px/1.2 system-ui,sans-serif;' +
  'color:#c9b8ff;background:rgba(10,8,18,.55);padding:5px 9px;border-radius:8px;' +
  'letter-spacing:.04em;pointer-events:none'
document.body.appendChild(painelFps)

let quadros = 0
let janelaFps = 0
let fpsAtual = 60
let segurandoBaixo = 0

function medirFps(agora) {
  quadros++
  if (janelaFps === 0) janelaFps = agora
  const decorrido = agora - janelaFps
  if (decorrido < 500) return

  fpsAtual = Math.round((quadros * 1000) / decorrido)
  quadros = 0
  janelaFps = agora
  painelFps.textContent = `${fpsAtual} FPS · ${Math.round(escalaRender * 100)}%`

  // Só reduz durante a partida, para não reagir a telas paradas.
  if (estado !== 'jogando') { segurandoBaixo = 0; return }
  if (fpsAtual < 45 && escalaRender > 0.5) {
    segurandoBaixo += decorrido
    if (segurandoBaixo >= 2000) {
      escalaRender = Math.max(0.6, Math.round((escalaRender - 0.1) * 100) / 100)
      localStorage.setItem('moto-tv.escala.v3', String(escalaRender))
      dimensionar()
      segurandoBaixo = 0
    }
  } else {
    segurandoBaixo = 0
  }
}

// HOOK TEMPORARIO DE MEDICAO — remover
window.__diag = () => ({
  calls: renderer.info.render.calls,
  tris: renderer.info.render.triangles,
  programas: renderer.info.programs.length,
  luzes: (() => { let n = 0; scene.traverse((o) => { if (o.isLight) n += 1 }); return n })(),
  objetos: (() => { let n = 0; scene.traverse((o) => { if (o.isMesh) n += 1 }); return n })(),
  estado,
  dpr: renderer.getPixelRatio(),
  tamanho: [renderer.domElement.width, renderer.domElement.height],
})
window.__forcar = (nome) => comando(nome)
window.__periodo = (p) => definirPeriodo(p)

// ------------------------------------------------------------------ boot
async function iniciar() {
  const preenche = el('cargaPreenche')
  const texto = el('cargaTexto')
  await carregarModelos((fracao, nome) => {
    preenche.style.width = `${Math.round(fracao * 100)}%`
    texto.textContent = `Carregando modelos… ${Math.round(fracao * 100)}% (${nome})`
  })

  cenario = criarCenario(scene, periodo)
  moto = await criarMoto(motoEscolhida)
  scene.add(moto)
  cenario.farolMoto = moto.userData.farol
  cenario.definirPeriodo(periodo)
  montarPool()

  preenche.style.width = '100%'
  irParaEspera()
  requestAnimationFrame(frame)
}

iniciar().catch((erro) => {
  const texto = el('cargaTexto')
  if (texto) texto.textContent = `Falha ao carregar o jogo: ${erro && erro.message ? erro.message : erro}`
  console.error('Falha ao iniciar o jogo', erro)
})
