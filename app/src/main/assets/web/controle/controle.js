// Seletor de jogo do celular. É a primeira tela após ler o QR: escolhe Moto ou
// Sinuca e carrega o controle específico sob demanda. Cada controle avisa a TV
// (mensagem `pick`) para abrir o jogo, e traz um botão "Sair" que recarrega esta
// página (voltando a este seletor) e manda a TV de volta ao menu.

const TELAS = ['tela-jogo', 'tela-preparacao', 'tela-controle', 'tela-sinuca-prep', 'tela-sinuca']

function mostrar(id) {
  for (const t of TELAS) {
    const e = document.getElementById(t)
    if (e) e.hidden = (t !== id)
  }
}

let carregado = false

document.getElementById('jogos').addEventListener('click', async (e) => {
  const botao = e.target.closest('[data-game]')
  if (!botao || carregado) return
  carregado = true
  if (botao.dataset.game === 'moto') {
    mostrar('tela-preparacao')
    await import('./moto-controle.js')
  } else {
    mostrar('tela-sinuca-prep')
    await import('./sinuca-controle.js')
  }
})
