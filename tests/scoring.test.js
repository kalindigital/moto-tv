import { describe, it, expect } from 'vitest'
import {
  pontosPor,
  criarPlacar,
  registrarUltrapassagem,
  inserirNoRanking,
  ehRecorde,
  formatarPontos,
} from '../app/src/main/assets/web/shared/scoring.js'

describe('pontosPor', () => {
  it('carro vale 1 parado e 2 acelerando', () => {
    expect(pontosPor('carro', false)).toBe(1)
    expect(pontosPor('carro', true)).toBe(2)
  })
  it('caminhão vale 2 parado e 4 acelerando', () => {
    expect(pontosPor('caminhao', false)).toBe(2)
    expect(pontosPor('caminhao', true)).toBe(4)
  })
  it('tipo desconhecido vale 0', () => {
    expect(pontosPor('moto', false)).toBe(0)
    expect(pontosPor('moto', true)).toBe(0)
    expect(pontosPor(undefined, true)).toBe(0)
  })
})

describe('criarPlacar', () => {
  it('começa zerado', () => {
    expect(criarPlacar()).toEqual({ pontos: 0, carros: 0, caminhoes: 0 })
  })
  it('devolve um objeto novo a cada chamada', () => {
    expect(criarPlacar()).not.toBe(criarPlacar())
  })
})

describe('registrarUltrapassagem', () => {
  it('soma pontos e conta carro', () => {
    expect(registrarUltrapassagem(criarPlacar(), 'carro', false)).toEqual({ pontos: 1, carros: 1, caminhoes: 0 })
  })
  it('soma pontos dobrados quando acelerando', () => {
    expect(registrarUltrapassagem(criarPlacar(), 'carro', true)).toEqual({ pontos: 2, carros: 1, caminhoes: 0 })
  })
  it('soma pontos e conta caminhão', () => {
    expect(registrarUltrapassagem(criarPlacar(), 'caminhao', false)).toEqual({ pontos: 2, carros: 0, caminhoes: 1 })
    expect(registrarUltrapassagem(criarPlacar(), 'caminhao', true)).toEqual({ pontos: 4, carros: 0, caminhoes: 1 })
  })
  it('acumula ao longo de várias ultrapassagens', () => {
    let placar = criarPlacar()
    placar = registrarUltrapassagem(placar, 'carro', false)
    placar = registrarUltrapassagem(placar, 'caminhao', true)
    placar = registrarUltrapassagem(placar, 'carro', true)
    expect(placar).toEqual({ pontos: 7, carros: 2, caminhoes: 1 })
  })
  it('tipo desconhecido devolve o placar inalterado', () => {
    const placar = { pontos: 5, carros: 3, caminhoes: 1 }
    expect(registrarUltrapassagem(placar, 'aviao', true)).toEqual(placar)
  })
  it('não muta o placar recebido', () => {
    const placar = criarPlacar()
    const novo = registrarUltrapassagem(placar, 'caminhao', true)
    expect(placar).toEqual({ pontos: 0, carros: 0, caminhoes: 0 })
    expect(novo).not.toBe(placar)
  })
})

describe('inserirNoRanking', () => {
  const e = (pontos, data) => ({ pontos, data })

  it('insere na lista vazia', () => {
    expect(inserirNoRanking([], e(10, '2026-08-14'))).toEqual([e(10, '2026-08-14')])
  })
  it('ordena por pontos decrescente', () => {
    const lista = [e(5, 'a'), e(20, 'b')]
    expect(inserirNoRanking(lista, e(12, 'c'))).toEqual([e(20, 'b'), e(12, 'c'), e(5, 'a')])
  })
  it('mantém ordem estável em empate (entradas antigas primeiro)', () => {
    const lista = [e(10, 'antiga'), e(10, 'meio')]
    expect(inserirNoRanking(lista, e(10, 'nova'))).toEqual([e(10, 'antiga'), e(10, 'meio'), e(10, 'nova')])
  })
  it('limita a 10 entradas por padrão, derrubando a menor', () => {
    const lista = Array.from({ length: 10 }, (_, i) => e((i + 1) * 10, `d${i}`))
    const resultado = inserirNoRanking(lista, e(55, 'nova'))
    expect(resultado).toHaveLength(10)
    expect(resultado[0]).toEqual(e(100, 'd9'))
    expect(resultado.at(-1)).toEqual(e(20, 'd1'))
    expect(resultado).toContainEqual(e(55, 'nova'))
    expect(resultado).not.toContainEqual(e(10, 'd0'))
  })
  it('descarta a entrada nova quando ela é a menor da lista cheia', () => {
    const lista = Array.from({ length: 10 }, (_, i) => e((i + 1) * 10, `d${i}`))
    const resultado = inserirNoRanking(lista, e(1, 'fraca'))
    expect(resultado).toHaveLength(10)
    expect(resultado).not.toContainEqual(e(1, 'fraca'))
  })
  it('respeita o limite máximo customizado', () => {
    const lista = [e(30, 'a'), e(20, 'b'), e(10, 'c')]
    expect(inserirNoRanking(lista, e(25, 'd'), 2)).toEqual([e(30, 'a'), e(25, 'd')])
  })
  it('não muta a lista recebida', () => {
    const lista = [e(5, 'a')]
    const resultado = inserirNoRanking(lista, e(9, 'b'))
    expect(lista).toEqual([e(5, 'a')])
    expect(resultado).not.toBe(lista)
  })
})

describe('ehRecorde', () => {
  it('lista vazia é sempre recorde', () => {
    expect(ehRecorde([], 0)).toBe(true)
    expect(ehRecorde([], 42)).toBe(true)
  })
  it('maior que o topo é recorde', () => {
    expect(ehRecorde([{ pontos: 30, data: 'a' }, { pontos: 10, data: 'b' }], 31)).toBe(true)
  })
  it('empatar com o topo não é recorde', () => {
    expect(ehRecorde([{ pontos: 30, data: 'a' }], 30)).toBe(false)
  })
  it('menor que o topo não é recorde', () => {
    expect(ehRecorde([{ pontos: 30, data: 'a' }], 29)).toBe(false)
  })
})

describe('formatarPontos', () => {
  it('formata com ponto de milhar', () => {
    expect(formatarPontos(0)).toBe('0')
    expect(formatarPontos(999)).toBe('999')
    expect(formatarPontos(1000)).toBe('1.000')
    expect(formatarPontos(1234)).toBe('1.234')
    expect(formatarPontos(1234567)).toBe('1.234.567')
  })
  it('entrada inválida vira 0', () => {
    expect(formatarPontos(NaN)).toBe('0')
    expect(formatarPontos(Infinity)).toBe('0')
    expect(formatarPontos(-5)).toBe('0')
    expect(formatarPontos('abc')).toBe('0')
    expect(formatarPontos(undefined)).toBe('0')
    expect(formatarPontos(null)).toBe('0')
  })
})
