// Pontuação da corrida: carro vale 1, caminhão vale 2, e acelerando dobra.
export function pontosPor(tipo, acelerando) {
  const base = tipo === 'carro' ? 1 : tipo === 'caminhao' ? 2 : 0
  return acelerando ? base * 2 : base
}

export function criarPlacar() {
  return { pontos: 0, carros: 0, caminhoes: 0 }
}

// Devolve sempre um placar novo; o original nunca é alterado.
export function registrarUltrapassagem(placar, tipo, acelerando) {
  const contador = tipo === 'carro' ? 'carros' : tipo === 'caminhao' ? 'caminhoes' : null
  if (!contador) return placar
  return {
    ...placar,
    pontos: placar.pontos + pontosPor(tipo, acelerando),
    [contador]: placar[contador] + 1,
  }
}

// Ranking em ordem decrescente de pontos; empate mantém quem chegou antes.
export function inserirNoRanking(lista, entrada, max = 10) {
  return [...lista, entrada].sort((a, b) => b.pontos - a.pontos).slice(0, max)
}

export function ehRecorde(lista, pontos) {
  return lista.every((entrada) => pontos > entrada.pontos)
}

// Formato pt-BR com ponto de milhar; entrada inválida vira "0".
export function formatarPontos(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return '0'
  return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}
