import { describe, it, expect } from 'vitest'
import {
  NIVEIS, PERFIS, NIVEL_PADRAO, nivelValido, criarQualidade,
} from '../app/src/main/assets/web/game/qualidade.js'

/** Alimenta o controle com `segundos` de quadros a um FPS constante. */
function rodar(q, fps, segundos) {
  const dt = 1 / fps
  const trocas = []
  for (let t = 0; t < segundos; t += dt) {
    const novo = q.quadro(dt)
    if (novo) trocas.push(novo)
  }
  return trocas
}

describe('perfis de qualidade', () => {
  it('tem um perfil para cada nível', () => {
    for (const nivel of NIVEIS) expect(PERFIS[nivel]).toBeTruthy()
  })

  it('fica mais pesado conforme sobe de nível', () => {
    const escalas = NIVEIS.map((n) => PERFIS[n].escalaRender)
    const densidades = NIVEIS.map((n) => PERFIS[n].densidade)
    const veiculos = NIVEIS.map((n) => PERFIS[n].veiculos)
    for (let i = 1; i < NIVEIS.length; i++) {
      expect(escalas[i]).toBeGreaterThan(escalas[i - 1])
      expect(densidades[i]).toBeGreaterThan(densidades[i - 1])
      expect(veiculos[i]).toBeGreaterThan(veiculos[i - 1])
    }
  })

  it('só o nível alto acende luz real no farol', () => {
    expect(PERFIS.alto.farolReal).toBe(true)
    expect(PERFIS.medio.farolReal).toBe(false)
    expect(PERFIS.baixo.farolReal).toBe(false)
  })

  it('nivelValido devolve o padrão para lixo', () => {
    expect(nivelValido('alto')).toBe('alto')
    expect(nivelValido('ultra')).toBe(NIVEL_PADRAO)
    expect(nivelValido(null)).toBe(NIVEL_PADRAO)
    expect(nivelValido(undefined)).toBe(NIVEL_PADRAO)
  })
})

describe('qualidade adaptativa', () => {
  it('começa no médio quando não há nível guardado', () => {
    expect(criarQualidade().nivel).toBe('medio')
    expect(criarQualidade('bagunça').nivel).toBe('medio')
  })

  it('respeita o nível guardado da última sessão', () => {
    expect(criarQualidade('baixo').nivel).toBe('baixo')
    expect(criarQualidade('alto').nivel).toBe('alto')
  })

  it('não decide nada durante a carência inicial', () => {
    const q = criarQualidade('alto')
    expect(rodar(q, 20, 1.4)).toEqual([])
    expect(q.nivel).toBe('alto')
  })

  it('desce de nível quando o FPS fica baixo', () => {
    const q = criarQualidade('alto')
    const trocas = rodar(q, 30, 6)
    expect(trocas[0]).toBe('medio')
    expect(q.nivel).toBe('medio')
  })

  it('desce até o mínimo se continuar ruim, e para lá', () => {
    const q = criarQualidade('alto')
    rodar(q, 22, 30)
    expect(q.nivel).toBe('baixo')
  })

  it('sobe de nível quando sobra folga', () => {
    const q = criarQualidade('medio')
    const trocas = rodar(q, 60, 14)
    expect(trocas).toContain('alto')
    expect(q.nivel).toBe('alto')
  })

  it('não sobe para um nível de onde já caiu (sem ping-pong)', () => {
    const q = criarQualidade('alto')
    rodar(q, 30, 6)
    expect(q.nivel).toBe('medio')
    // A partir daqui a TV finge estar sobrando: mesmo assim não volta ao alto.
    rodar(q, 60, 60)
    expect(q.nivel).toBe('medio')
  })

  it('um engasgo isolado não derruba o nível', () => {
    const q = criarQualidade('alto')
    rodar(q, 60, 4)
    rodar(q, 20, 0.6)     // meio segundo ruim
    rodar(q, 60, 4)
    expect(q.nivel).toBe('alto')
  })

  it('ignora quadros gigantes (pausa, carga, tela de fundo)', () => {
    const q = criarQualidade('alto')
    rodar(q, 60, 3)
    for (let i = 0; i < 40; i++) q.quadro(2)      // 2 s por quadro
    expect(q.nivel).toBe('alto')
  })

  it('ignora dt inválido', () => {
    const q = criarQualidade('medio')
    for (let i = 0; i < 100; i++) {
      expect(q.quadro(0)).toBe(null)
      expect(q.quadro(-1)).toBe(null)
      expect(q.quadro(NaN)).toBe(null)
    }
    expect(q.nivel).toBe('medio')
  })

  it('expõe a média de FPS para o contador da tela', () => {
    const q = criarQualidade('medio')
    rodar(q, 60, 6)
    expect(q.fps).toBeGreaterThan(50)
    expect(q.fps).toBeLessThanOrEqual(61)
  })

  it('o perfil acompanha o nível atual', () => {
    const q = criarQualidade('alto')
    expect(q.perfil).toBe(PERFIS.alto)
    rodar(q, 30, 6)
    expect(q.perfil).toBe(PERFIS.medio)
  })
})
