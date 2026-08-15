import { describe, it, expect } from 'vitest'
import { alvosPossiveis, escolherTacada, DIFICULDADES } from '../app/src/main/assets/web/shared/pool-ai.js'

const R = 3.4
const bola = (id, x, y) => ({ id, x, y, r: R, potted: false })
// Caçapas de uma mesa 200x100 (mesma geometria do jogo).
const POCKETS = [
  { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 },
  { x: 0, y: 100 }, { x: 100, y: 100 }, { x: 200, y: 100 },
]

describe('pool-ai · escolha de alvos', () => {
  it('com grupo definido, só considera as bolas do próprio grupo', () => {
    const balls = [bola(0, 50, 50), bola(3, 80, 50), bola(11, 90, 50)]
    const ids = alvosPossiveis(balls, { grupo: 'solid', mesaAberta: false }).map((b) => b.id)
    expect(ids).toEqual([3])
  })
  it('com a mesa aberta, considera todas menos a 8 e a branca', () => {
    const balls = [bola(0, 50, 50), bola(3, 80, 50), bola(11, 90, 50), bola(8, 95, 50)]
    const ids = alvosPossiveis(balls, { grupo: null, mesaAberta: true }).map((b) => b.id).sort((a, b) => a - b)
    expect(ids).toEqual([3, 11])
  })
  it('com o grupo limpo, o alvo passa a ser a 8', () => {
    const balls = [bola(0, 50, 50), bola(8, 95, 50), bola(11, 90, 50)]
    const ids = alvosPossiveis(balls, { grupo: 'solid', mesaAberta: false }).map((b) => b.id)
    expect(ids).toEqual([8])
  })
  it('ignora bolas já encaçapadas', () => {
    const balls = [bola(0, 50, 50), { ...bola(3, 80, 50), potted: true }, bola(5, 60, 40)]
    const ids = alvosPossiveis(balls, { grupo: 'solid', mesaAberta: false }).map((b) => b.id)
    expect(ids).toEqual([5])
  })
})

describe('pool-ai · mira', () => {
  it('mira no ponto fantasma: bola alinhada com a caçapa é atacada em linha reta', () => {
    // branca em (20,50), alvo em (100,50) e caçapa em (200,50)? não existe —
    // usamos a caçapa do meio de baixo (100,100) com o alvo logo acima dela.
    const balls = [bola(0, 100, 20), bola(3, 100, 60)]
    const t = escolherTacada(balls, POCKETS, { grupo: 'solid', mesaAberta: false, erro: 0 })
    expect(t).not.toBeNull()
    expect(t.alvo).toBe(3)
    // o fantasma fica 2r acima do alvo, ou seja, direto para baixo (+y): π/2
    expect(t.angle).toBeCloseTo(Math.PI / 2, 2)
    expect(t.power).toBeGreaterThan(0)
    expect(t.power).toBeLessThanOrEqual(1)
  })

  it('prefere a tacada mais fácil (reta e perto) à difícil', () => {
    const facil = bola(3, 100, 60)                 // alinhada com a caçapa (100,100)
    const dificil = bola(5, 190, 12)               // longe e em ângulo ruim
    const balls = [bola(0, 100, 20), facil, dificil]
    const t = escolherTacada(balls, POCKETS, { grupo: 'solid', mesaAberta: false, erro: 0 })
    expect(t.alvo).toBe(3)
  })

  it('não escolhe alvo com a trajetória bloqueada por outra bola', () => {
    // alvo 3 alinhado com a caçapa do meio, mas a 11 tapa o caminho da branca
    const balls = [bola(0, 100, 20), bola(11, 100, 40), bola(3, 100, 60), bola(5, 40, 60)]
    const t = escolherTacada(balls, POCKETS, { grupo: 'solid', mesaAberta: false, erro: 0 })
    expect(t.alvo).toBe(5)
  })

  it('sem alvo possível ainda devolve uma tacada (não trava o jogo)', () => {
    const balls = [bola(0, 100, 50)]
    const t = escolherTacada(balls, POCKETS, { grupo: 'solid', mesaAberta: false, erro: 0 })
    expect(t).not.toBeNull()
    expect(Number.isFinite(t.angle)).toBe(true)
    expect(t.power).toBeGreaterThan(0)
  })

  it('o erro de mira desloca o ângulo dentro do limite pedido', () => {
    const balls = [bola(0, 100, 20), bola(3, 100, 60)]
    const exato = escolherTacada(balls, POCKETS, { grupo: 'solid', mesaAberta: false, erro: 0 })
    const torto = escolherTacada(balls, POCKETS, { grupo: 'solid', mesaAberta: false, erro: 0.05, rnd: () => 1 })
    expect(Math.abs(torto.angle - exato.angle)).toBeCloseTo(0.05, 6)
  })
})

describe('pool-ai · dificuldades', () => {
  it('tem os três níveis, do mais impreciso ao mais preciso', () => {
    expect(Object.keys(DIFICULDADES).sort()).toEqual(['dificil', 'facil', 'medio'])
    expect(DIFICULDADES.facil.erro).toBeGreaterThan(DIFICULDADES.medio.erro)
    expect(DIFICULDADES.medio.erro).toBeGreaterThan(DIFICULDADES.dificil.erro)
  })

  it('nenhum nível é infalível: até o difícil erra de vez em quando', () => {
    for (const nivel of Object.values(DIFICULDADES)) {
      expect(nivel.erro).toBeGreaterThan(0)
      expect(nivel.chanceVacilo).toBeGreaterThan(0)
      expect(nivel.chanceVacilo).toBeLessThan(1)
    }
    // no difícil o vacilo é o mais raro dos três
    expect(DIFICULDADES.dificil.chanceVacilo).toBeLessThan(DIFICULDADES.facil.chanceVacilo)
  })

  it('aceita a dificuldade pelo nome e aplica o erro daquele nível', () => {
    const balls = [bola(0, 100, 20), bola(3, 100, 60)]
    const exato = escolherTacada(balls, POCKETS, { grupo: 'solid', mesaAberta: false, erro: 0 })
    // rnd fixo em 1: sem vacilo (1 >= chanceVacilo) e desvio no limite do nível
    const facil = escolherTacada(balls, POCKETS, { grupo: 'solid', mesaAberta: false, dificuldade: 'facil', rnd: () => 1 })
    expect(Math.abs(facil.angle - exato.angle)).toBeCloseTo(DIFICULDADES.facil.erro, 6)
  })

  it('quando vacila, o desvio é bem maior que o erro normal do nível', () => {
    const balls = [bola(0, 100, 20), bola(3, 100, 60)]
    const exato = escolherTacada(balls, POCKETS, { grupo: 'solid', mesaAberta: false, erro: 0 })
    // rnd fixo em 0: cai dentro da chance de vacilo
    const vacilo = escolherTacada(balls, POCKETS, { grupo: 'solid', mesaAberta: false, dificuldade: 'dificil', rnd: () => 0 })
    expect(Math.abs(vacilo.angle - exato.angle)).toBeGreaterThan(DIFICULDADES.dificil.erro)
  })
})
