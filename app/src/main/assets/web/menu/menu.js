import { parseMessage } from '../shared/cue-protocol.js'

/**
 * Menu (launcher) do app: escolhe entre Moto e Sinuca. A escolha pode vir do
 * controle da TV (◄ ► + OK) ou do celular (mensagem `pick` pela WS). Ao escolher,
 * a WebView navega para a página do jogo — cada jogo é uma página independente.
 */

const JOGOS = ['moto', 'sinuca']
const DESTINO = { moto: '/game/index.html', sinuca: '/sinuca/index.html' }

const el = (id) => document.getElementById(id)
let navegando = false

function navegar(game) {
  if (navegando || !DESTINO[game]) return
  navegando = true
  location.href = DESTINO[game]
}

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
// A TV é só a vitrine: quem escolhe o jogo é o celular. O OK aqui serve apenas
// para confirmar a atualização quando o banner está na tela.
addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && atualizacao && !atualizando) iniciarAtualizacao()
})
