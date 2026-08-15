import { describe, it, expect } from 'vitest'
import { initialState, groupOf, resolveShot } from '../app/src/main/assets/web/shared/pool-rules.js'

// Atalho para montar o resultado de uma tacada.
const tacada = (o = {}) => ({
  potted: [],
  cuePotted: false,
  firstContact: null,
  railAfterContact: true,
  remaining: { solids: 7, stripes: 7 },
  ...o,
})

describe('pool-rules · básico', () => {
  it('estado inicial: mesa aberta, vez do jogador 1, na quebra', () => {
    const s = initialState()
    expect(s.turn).toBe(1)
    expect(s.open).toBe(true)
    expect(s.phase).toBe('break')
    expect(s.groups).toEqual({ 1: null, 2: null })
  })
  it('groupOf classifica lisas, listradas, 8 e branca', () => {
    expect(groupOf(3)).toBe('solid')
    expect(groupOf(12)).toBe('stripe')
    expect(groupOf(8)).toBe('eight')
    expect(groupOf(0)).toBe('cue')
  })
})

describe('pool-rules · mesa aberta', () => {
  const aberta = () => ({ ...initialState(), phase: 'playing' })

  it('encaçapar uma lisa define o atirador como lisas e ele continua', () => {
    const r = resolveShot(aberta(), tacada({ potted: [3], firstContact: 3, remaining: { solids: 6, stripes: 7 } }))
    expect(r.groups[1]).toBe('solid')
    expect(r.groups[2]).toBe('stripe')
    expect(r.open).toBe(false)
    expect(r.turn).toBe(1)
    expect(r.potContinues).toBe(true)
    expect(r.foul).toBe(false)
  })
  it('encaçapar uma listrada define o atirador como listradas', () => {
    const r = resolveShot(aberta(), tacada({ potted: [11], firstContact: 11, remaining: { solids: 7, stripes: 6 } }))
    expect(r.groups[1]).toBe('stripe')
    expect(r.open).toBe(false)
  })
  it('acertar a 8 primeiro com a mesa aberta é falta e dá bola na mão', () => {
    const r = resolveShot(aberta(), tacada({ firstContact: 8 }))
    expect(r.foul).toBe(true)
    expect(r.turn).toBe(2)
    expect(r.ballInHand).toBe(true)
  })
  it('não encaçapar nada passa a vez sem bola na mão', () => {
    const r = resolveShot(aberta(), tacada({ firstContact: 5 }))
    expect(r.foul).toBe(false)
    expect(r.turn).toBe(2)
    expect(r.potContinues).toBe(false)
    expect(r.ballInHand).toBe(false)
  })
})

describe('pool-rules · faltas', () => {
  const jogando = () => ({ ...initialState(), phase: 'playing', open: false, groups: { 1: 'solid', 2: 'stripe' } })

  it('encaçapar a branca (scratch) é falta com bola na mão', () => {
    const r = resolveShot(jogando(), tacada({ cuePotted: true, firstContact: 2, potted: [2], remaining: { solids: 6, stripes: 7 } }))
    expect(r.foul).toBe(true)
    expect(r.turn).toBe(2)
    expect(r.ballInHand).toBe(true)
  })
  it('não tocar em nenhuma bola é falta', () => {
    const r = resolveShot(jogando(), tacada({ firstContact: null }))
    expect(r.foul).toBe(true)
    expect(r.ballInHand).toBe(true)
  })
  it('acertar o grupo errado primeiro é falta', () => {
    const r = resolveShot(jogando(), tacada({ firstContact: 11 }))
    expect(r.foul).toBe(true)
    expect(r.ballInHand).toBe(true)
  })
  it('nada encaçapado e nenhuma tabela após o contato é falta (scratch de mesa)', () => {
    const r = resolveShot(jogando(), tacada({ firstContact: 2, railAfterContact: false }))
    expect(r.foul).toBe(true)
  })
  it('acertar o próprio grupo e encaçapar continua a vez', () => {
    const r = resolveShot(jogando(), tacada({ firstContact: 2, potted: [2], remaining: { solids: 6, stripes: 7 } }))
    expect(r.foul).toBe(false)
    expect(r.turn).toBe(1)
    expect(r.potContinues).toBe(true)
  })
})

describe('pool-rules · a bola 8 decide o jogo', () => {
  const naOito = () => ({ ...initialState(), phase: 'playing', open: false, groups: { 1: 'solid', 2: 'stripe' } })

  it('encaçapar a 8 com o grupo já limpo e sem falta vence', () => {
    const r = resolveShot(naOito(), tacada({ firstContact: 8, potted: [8], remaining: { solids: 0, stripes: 4 } }))
    expect(r.phase).toBe('gameover')
    expect(r.winner).toBe(1)
  })
  it('encaçapar a 8 cedo (grupo não limpo) perde', () => {
    const r = resolveShot(naOito(), tacada({ firstContact: 2, potted: [2, 8], remaining: { solids: 3, stripes: 4 } }))
    expect(r.phase).toBe('gameover')
    expect(r.winner).toBe(2)
  })
  it('encaçapar a 8 legal mas com scratch perde', () => {
    const r = resolveShot(naOito(), tacada({ firstContact: 8, potted: [8], cuePotted: true, remaining: { solids: 0, stripes: 4 } }))
    expect(r.phase).toBe('gameover')
    expect(r.winner).toBe(2)
  })
  it('estando na 8, acertar outra bola primeiro é falta', () => {
    const r = resolveShot(naOito(), tacada({ firstContact: 11, remaining: { solids: 0, stripes: 4 } }))
    expect(r.foul).toBe(true)
    expect(r.ballInHand).toBe(true)
  })
})

describe('pool-rules · quebra', () => {
  it('a quebra não define grupos mesmo encaçapando (mesa segue aberta)', () => {
    const r = resolveShot(initialState(), tacada({ potted: [3], firstContact: 1, remaining: { solids: 6, stripes: 7 } }))
    expect(r.open).toBe(true)
    expect(r.groups).toEqual({ 1: null, 2: null })
    expect(r.phase).toBe('playing')
  })
  it('encaçapar a 8 na quebra vence (regra da casa)', () => {
    const r = resolveShot(initialState(), tacada({ potted: [8], firstContact: 1, remaining: { solids: 7, stripes: 7 } }))
    expect(r.phase).toBe('gameover')
    expect(r.winner).toBe(1)
  })
})
