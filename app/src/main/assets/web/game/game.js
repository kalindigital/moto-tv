import * as THREE from '../vendor/three.module.js'
import { aabbOverlap } from '../shared/collision.js'
import { parseMessage } from '../shared/protocol.js'

const LANES = [-2.2, 0, 2.2]
const MOTO = { w: 1.0, d: 2.0 }
const CAR = { w: 1.4, d: 2.4 }

let state = 'aguardando'   // aguardando | jogando | crashed
let steer = 0              // -1..1 (WebSocket ou teclado)
let targetX = 0
let speed = 22             // unidades/seg do "mundo" andando

// ---- Three.js setup ----
const scene = new THREE.Scene()
scene.fog = new THREE.Fog(0x0b0b12, 30, 90)
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 200)
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(innerWidth, innerHeight)
document.body.appendChild(renderer.domElement)
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.1))

// pista
const road = new THREE.Mesh(
  new THREE.PlaneGeometry(9, 400),
  new THREE.MeshStandardMaterial({ color: 0x1a1a22 })
)
road.rotation.x = -Math.PI / 2
road.position.z = -180
scene.add(road)

// faixas (marcadores que "andam" para trás para dar sensação de velocidade)
const stripes = []
for (let i = 0; i < 40; i++) {
  const s = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.02, 2),
    new THREE.MeshStandardMaterial({ color: 0x666677 })
  )
  s.position.set(0, 0.02, -i * 8)
  scene.add(s); stripes.push(s)
}

// moto (placeholder)
const moto = new THREE.Mesh(
  new THREE.BoxGeometry(MOTO.w, 1, MOTO.d),
  new THREE.MeshStandardMaterial({ color: 0x6E29F6 })
)
moto.position.set(0, 0.5, 0)
scene.add(moto)

// carros (pool)
const cars = []
for (let i = 0; i < 6; i++) {
  const c = new THREE.Mesh(
    new THREE.BoxGeometry(CAR.w, 1.2, CAR.d),
    new THREE.MeshStandardMaterial({ color: 0xdd3333 })
  )
  c.visible = false
  c.userData.active = false
  scene.add(c); cars.push(c)
}
let spawnTimer = 0

function spawnCar() {
  const c = cars.find((x) => !x.userData.active)
  if (!c) return
  c.userData.active = true
  c.visible = true
  c.position.set(LANES[(Math.random() * LANES.length) | 0], 0.6, -80)
}

function resetGame() {
  cars.forEach((c) => { c.userData.active = false; c.visible = false })
  moto.position.x = 0; targetX = 0; steer = 0
  spawnTimer = 0
  state = 'jogando'
  setOverlay(false)
}

function setOverlay(show, msg) {
  const o = document.getElementById('overlay')
  o.classList.toggle('hidden', !show)
  if (msg) document.getElementById('msg').textContent = msg
}

// ---- banner de atualização ----
// A checagem no GitHub roda em paralelo ao start do servidor e pode terminar
// depois desta página carregar; por isso a consulta se repete algumas vezes.
let atualizacao = null      // { versao, changelog } quando há versão nova
let atualizando = false     // download em andamento (o banner para de aceitar OK)
let tentativasUpdate = 0

function mostrarBanner(texto) {
  const b = document.getElementById('update')
  b.textContent = texto
  b.classList.remove('hidden')
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

// ---- config + QR ----
fetch('/config').then((r) => r.json()).then((cfg) => {
  // eslint-disable-next-line no-new
  new QRCode(document.getElementById('qr'), { text: cfg.controllerUrl, width: 220, height: 220 })
})

// ---- WebSocket (recebe steer/restart do celular) ----
function connectWs() {
  const ws = new WebSocket(`wss://${location.host}/ws`)
  ws.onmessage = (ev) => {
    const m = parseMessage(ev.data)
    if (m.type === 'steer') {
      steer = m.value
      if (state === 'aguardando') resetGame()
    } else if (m.type === 'action' && m.name === 'restart') {
      resetGame()
    }
  }
  ws.onclose = () => setTimeout(connectWs, 1000)
  ws.onerror = () => ws.close()
}
connectWs()

// ---- fallback de teclado (dev, sem celular) ----
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') { steer = -1; if (state === 'aguardando') resetGame() }
  if (e.key === 'ArrowRight') { steer = 1; if (state === 'aguardando') resetGame() }
  if (e.key === 'Enter') {
    // O OK do controle da TV chega como Enter. Enquanto houver atualização à
    // espera de confirmação, ele é do banner; depois volta a ser do jogo.
    // As setas (jogabilidade) nunca são tocadas por isso.
    if (atualizacao && !atualizando) { iniciarAtualizacao(); return }
    if (state === 'crashed') resetGame()
  }
})
addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') steer = 0
})

// ---- loop ----
let last = performance.now()
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05)
  last = now

  if (state === 'jogando') {
    // move a moto lateralmente
    targetX = Math.max(-3.2, Math.min(3.2, targetX + steer * dt * 6))
    moto.position.x += (targetX - moto.position.x) * 0.2
    moto.rotation.z = -steer * 0.3

    // "mundo" andando: faixas vêm em direção à câmera e reciclam para o fundo
    for (const s of stripes) {
      s.position.z += speed * dt
      if (s.position.z > 6) s.position.z -= 320
    }

    spawnTimer += dt
    if (spawnTimer > 0.9) { spawnTimer = 0; spawnCar() }

    for (const c of cars) {
      if (!c.userData.active) continue
      c.position.z += speed * dt
      if (c.position.z > 6) { c.userData.active = false; c.visible = false; continue }
      const hit = aabbOverlap(
        { x: moto.position.x, z: moto.position.z, w: MOTO.w, d: MOTO.d },
        { x: c.position.x, z: c.position.z, w: CAR.w, d: CAR.d }
      )
      if (hit) { state = 'crashed'; setOverlay(true, 'Bateu! Reinicie no celular (ou Enter)') }
    }
  }

  // câmera em 3ª pessoa
  camera.position.set(moto.position.x * 0.5, 4, moto.position.z + 8)
  camera.lookAt(moto.position.x * 0.3, 1, moto.position.z - 10)

  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
