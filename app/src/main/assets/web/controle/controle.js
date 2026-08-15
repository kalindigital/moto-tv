import { serializeJoin, parseMessage } from '../shared/cue-protocol.js'

/**
 * Entrada do controle no celular.
 *
 * Ao abrir (logo após ler o QR), tenta ENTRAR DIRETO no jogo que já está na TV:
 * manda `join` e espera o `assign` da sinuca. Se vier, o celular já é Jogador 1
 * ou 2 e vai direto para o controle da sinuca — sem passar pelo seletor.
 * Se ninguém responder (a TV está no menu), mostra a escolha de jogo.
 *
 * A identidade fica em `window.__ctrl` para o controle da sinuca reaproveitar —
 * assim o jogador não é reatribuído ao trocar de tela.
 */

const TELAS = ['tela-jogo', 'tela-preparacao', 'tela-controle', 'tela-sinuca-prep', 'tela-sinuca']
const ESPERA_MS = 1600      // tempo de tolerância para a TV responder ao join

const meuId = (window.crypto && crypto.randomUUID)
  ? crypto.randomUUID()
  : `c${Math.random().toString(36).slice(2)}${Date.now()}`

window.__ctrl = { id: meuId, player: null }

const el = (id) => document.getElementById(id)

function mostrar(id) {
  for (const t of TELAS) {
    const e = el(t)
    if (e) e.hidden = (t !== id)
  }
}

let resolvido = false

async function entrarNaSinuca() {
  mostrar('tela-sinuca-prep')
  await import('./sinuca-controle.js')
}

async function entrarNaMoto() {
  mostrar('tela-preparacao')
  await import('./moto-controle.js')
}

// ------------------------------------------------- tentativa de entrada direta
// Socket de sondagem: some assim que o jogo é decidido; o controle específico
// abre a própria conexão depois.
function sondar() {
  let ws
  try {
    ws = new WebSocket(`wss://${location.host}/ws`)
  } catch {
    mostrarSeletor()
    return
  }

  const bater = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send(serializeJoin(meuId))
  }, 350)

  const desistir = setTimeout(() => {
    if (resolvido) return
    limpar()
    mostrarSeletor()
  }, ESPERA_MS)

  function limpar() {
    clearInterval(bater)
    clearTimeout(desistir)
    try { ws.close() } catch { /* ignora */ }
  }

  ws.onopen = () => ws.send(serializeJoin(meuId))
  ws.onerror = () => { /* o timeout resolve */ }
  ws.onmessage = (ev) => {
    const m = parseMessage(ev.data)
    if (resolvido) return
    if (m.type === 'assign' && m.id === meuId) {
      resolvido = true
      window.__ctrl.player = m.player
      limpar()
      entrarNaSinuca()
    }
  }
}

function mostrarSeletor() {
  mostrar('tela-jogo')
  const status = el('jogo-status')
  if (status) status.textContent = ''
}

// ------------------------------------------------------------ seletor manual
el('jogos').addEventListener('click', async (e) => {
  const botao = e.target.closest('[data-game]')
  if (!botao || resolvido) return
  resolvido = true
  if (botao.dataset.game === 'moto') entrarNaMoto()
  else entrarNaSinuca()
})

sondar()
