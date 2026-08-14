import { gammaToSteer } from '../shared/steering.js'
import { serializeSteer, serializeAction } from '../shared/protocol.js'

const wsUrl = `wss://${location.host}/ws`
let ws
let neutral = 0
let lastSent = 0
let lastValue = 999

const dot = document.getElementById('dot')
const conn = document.getElementById('conn')
const fill = document.getElementById('fill')

function connect() {
  ws = new WebSocket(wsUrl)
  ws.onopen = () => { dot.classList.add('on'); conn.textContent = 'conectado' }
  ws.onclose = () => { dot.classList.remove('on'); conn.textContent = 'reconectando…'; setTimeout(connect, 1000) }
  ws.onerror = () => ws.close()
}

function onOrientation(e) {
  const gamma = Number.isFinite(e.gamma) ? e.gamma : 0
  const steer = gammaToSteer(gamma, { neutral, maxAngle: 35, deadzone: 3 })
  fill.style.width = `${(steer + 1) * 50}%`
  const now = performance.now()
  if (now - lastSent > 16 && Math.abs(steer - lastValue) > 0.01) {
    lastSent = now
    lastValue = steer
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(serializeSteer(steer))
  }
}

document.getElementById('start').addEventListener('click', async () => {
  // iOS exige permissão explícita a partir de um gesto
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const res = await DeviceOrientationEvent.requestPermission()
      if (res !== 'granted') { alert('Permissão de movimento negada'); return }
    } catch { alert('Erro ao pedir permissão'); return }
  }
  window.addEventListener('deviceorientation', onOrientation)
  document.getElementById('start').style.display = 'none'
})

document.getElementById('calib').addEventListener('click', () => {
  // usa a leitura atual como novo neutro
  window.addEventListener('deviceorientation', function once(e) {
    neutral = e.gamma ?? 0
    window.removeEventListener('deviceorientation', once)
  }, { once: true })
})

document.getElementById('restart').addEventListener('click', () => {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(serializeAction('restart'))
})

connect()
