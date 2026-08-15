import { describe, it, expect } from 'vitest'
import {
  collideElastic,
  reflectCushion,
  stepBall,
  pocketed,
  allAtRest,
  curvarPorEfeito,
  seguirOuPuxar,
} from '../app/src/main/assets/web/shared/billiards.js'

const bola = (x, y, vx = 0, vy = 0, r = 1) => ({ x, y, vx, vy, r })

describe('billiards · colisão elástica entre bolas de mesma massa', () => {
  it('choque frontal troca as velocidades no eixo do impacto', () => {
    const a = bola(0, 0, 1, 0)
    const b = bola(1.5, 0) // encostadas/sobrepostas no eixo x (soma dos raios = 2)
    const bateu = collideElastic(a, b)
    expect(bateu).toBe(true)
    expect(a.vx).toBeCloseTo(0, 6)
    expect(b.vx).toBeCloseTo(1, 6)
  })
  it('separa as bolas sobrepostas (remove o overlap)', () => {
    const a = bola(0, 0, 1, 0)
    const b = bola(1.5, 0)
    collideElastic(a, b)
    const dist = Math.hypot(b.x - a.x, b.y - a.y)
    expect(dist).toBeGreaterThanOrEqual(a.r + b.r - 1e-6)
  })
  it('bolas se afastando não trocam velocidade (não grudam)', () => {
    const a = bola(0, 0, -1, 0) // indo para longe de b
    const b = bola(1.5, 0, 0, 0)
    const bateu = collideElastic(a, b)
    expect(bateu).toBe(false)
    expect(a.vx).toBeCloseTo(-1, 6)
    expect(b.vx).toBeCloseTo(0, 6)
  })
  it('bolas distantes não colidem', () => {
    const a = bola(0, 0, 1, 0)
    const b = bola(10, 0)
    expect(collideElastic(a, b)).toBe(false)
  })
})

describe('billiards · reflexão nas tabelas', () => {
  const bounds = { left: 0, right: 10, top: 0, bottom: 10 }
  it('reflete na esquerda e reposiciona na borda', () => {
    const b = bola(-0.5, 5, -2, 0)
    expect(reflectCushion(b, bounds, 1)).toBe(true)
    expect(b.x).toBeCloseTo(0, 6)
    expect(b.vx).toBeCloseTo(2, 6)
  })
  it('reflete na direita perdendo energia com a restituição', () => {
    const b = bola(10.4, 5, 2, 0)
    reflectCushion(b, bounds, 0.5)
    expect(b.x).toBeCloseTo(10, 6)
    expect(b.vx).toBeCloseTo(-1, 6)
  })
  it('dentro dos limites não reflete', () => {
    const b = bola(5, 5, 1, 1)
    expect(reflectCushion(b, bounds, 1)).toBe(false)
  })
})

describe('billiards · integração com atrito', () => {
  it('sem atrito, anda velocidade × dt', () => {
    const b = bola(0, 0, 2, 0)
    stepBall(b, 0.5, 0, 0.01)
    expect(b.x).toBeCloseTo(1, 6)
    expect(b.vx).toBeCloseTo(2, 6)
  })
  it('o atrito reduz a velocidade', () => {
    const b = bola(0, 0, 2, 0)
    stepBall(b, 1, 0.5, 0.01) // desacelera 0.5 u/s
    expect(b.vx).toBeCloseTo(1.5, 6)
  })
  it('abaixo da velocidade mínima a bola para de vez', () => {
    const b = bola(0, 0, 0.02, 0)
    stepBall(b, 1, 1, 0.05) // desaceleração forte + limiar 0.05
    expect(b.vx).toBe(0)
    expect(b.vy).toBe(0)
  })
})

describe('billiards · efeito lateral (curva)', () => {
  it('efeito para a direita curva a trajetória sem mudar a velocidade', () => {
    const b = bola(0, 0, 10, 0)
    curvarPorEfeito(b, 1, 0.1, 2)      // k=2 → gira 2·1·0.1 = 0.2 rad
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(10, 6)
    expect(Math.atan2(b.vy, b.vx)).toBeCloseTo(0.2, 6)
  })
  it('efeito para a esquerda curva para o outro lado', () => {
    const b = bola(0, 0, 10, 0)
    curvarPorEfeito(b, -1, 0.1, 2)
    expect(Math.atan2(b.vy, b.vx)).toBeCloseTo(-0.2, 6)
  })
  it('sem efeito, nada muda', () => {
    const b = bola(0, 0, 10, 0)
    curvarPorEfeito(b, 0, 0.1, 2)
    expect(b.vy).toBeCloseTo(0, 9)
  })
  it('bola parada não curva (não há trajetória para desviar)', () => {
    const b = bola(0, 0, 0, 0)
    curvarPorEfeito(b, 1, 0.1, 2)
    expect(b.vx).toBe(0)
    expect(b.vy).toBe(0)
  })
})

describe('billiards · efeito de cima/baixo (seguir e puxar)', () => {
  it('taco alto: a branca segue a bola após o toque', () => {
    const cue = bola(0, 0, 0, 0)
    seguirOuPuxar(cue, 1, 1, 0, 10)     // normal apontando para +x
    expect(cue.vx).toBeCloseTo(10, 6)
  })
  it('taco baixo: a branca volta após o toque', () => {
    const cue = bola(0, 0, 0, 0)
    seguirOuPuxar(cue, -1, 1, 0, 10)
    expect(cue.vx).toBeCloseTo(-10, 6)
  })
  it('taco no meio não altera nada', () => {
    const cue = bola(0, 0, 3, 0)
    seguirOuPuxar(cue, 0, 1, 0, 10)
    expect(cue.vx).toBeCloseTo(3, 6)
  })
})

describe('billiards · caçapas e repouso', () => {
  const pockets = [{ x: 0, y: 0 }, { x: 10, y: 10 }]
  it('detecta bola dentro da caçapa', () => {
    expect(pocketed(bola(0.3, 0.2), pockets, 1)).toBe(true)
  })
  it('bola longe da caçapa não é encaçapada', () => {
    expect(pocketed(bola(5, 5), pockets, 1)).toBe(false)
  })
  it('allAtRest é falso se alguma bola se move', () => {
    expect(allAtRest([bola(0, 0, 0, 0), bola(1, 1, 0.1, 0)])).toBe(false)
  })
  it('allAtRest é verdadeiro com tudo parado', () => {
    expect(allAtRest([bola(0, 0), bola(1, 1)])).toBe(true)
  })
  it('ignora bolas já encaçapadas ao checar repouso', () => {
    const encaçapada = { ...bola(1, 1, 5, 0), potted: true }
    expect(allAtRest([bola(0, 0), encaçapada])).toBe(true)
  })
})
