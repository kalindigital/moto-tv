import { parseMessage } from '../shared/cue-protocol.js'

/**
 * Menu (launcher) do app: escolhe entre Moto e Sinuca. A escolha pode vir do
 * controle da TV (◄ ► + OK) ou do celular (mensagem `pick` pela WS). Ao escolher,
 * a WebView navega para a página do jogo — cada jogo é uma página independente.
 */

const JOGOS = ['moto', 'sinuca']
const DESTINO = { moto: '/game/index.html', sinuca: '/sinuca/index.html' }

const el = (id) => document.getElementById(id)
const cards = Array.from(document.querySelectorAll('.card'))
let selecionado = 0
let navegando = false

function marcar() {
  cards.forEach((c, i) => c.setAttribute('aria-selected', String(i === selecionado)))
}

function mover(delta) {
  selecionado = (selecionado + delta + cards.length) % cards.length
  marcar()
}

function navegar(game) {
  if (navegando || !DESTINO[game]) return
  navegando = true
  location.href = DESTINO[game]
}

// ------------------------------------------------------------- clique (dev/mouse)
cards.forEach((c, i) => {
  c.addEventListener('click', () => { selecionado = i; marcar(); navegar(c.dataset.game) })
})

// ------------------------------------------------------------- QR (via /config)
fetch('/config')
  .then((r) => r.json())
  .then((cfg) => {
    if (!cfg || !cfg.controllerUrl || typeof QRCode !== 'function') return
    // eslint-disable-next-line no-new
    new QRCode(el('qr'), { text: cfg.controllerUrl, width: 190, height: 190 })
  })
  .catch(() => {})

// ------------------------------------------------------- banner de atualização
let atualizacao = null
let atualizando = false
let tentativas = 0

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
      if (++tentativas < 6) setTimeout(checarAtualizacao, 5000)
    })
    .catch(() => { if (++tentativas < 6) setTimeout(checarAtualizacao, 5000) })
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

// ------------------------------------------------------------------ WebSocket
function connectWs() {
  const ws = new WebSocket(`wss://${location.host}/ws`)
  ws.onmessage = (ev) => {
    const m = parseMessage(ev.data)
    if (m.type === 'pick' && JOGOS.includes(m.game)) navegar(m.game)
  }
  ws.onclose = () => { if (!navegando) setTimeout(connectWs, 1000) }
  ws.onerror = () => ws.close()
}
connectWs()

// ------------------------------------------------------------- controle da TV
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') mover(-1)
  else if (e.key === 'ArrowRight') mover(1)
  else if (e.key === 'Enter') {
    if (atualizacao && !atualizando) { iniciarAtualizacao(); return }
    navegar(cards[selecionado].dataset.game)
  }
})

marcar()
