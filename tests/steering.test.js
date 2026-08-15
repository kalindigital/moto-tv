import { describe, it, expect } from 'vitest'
import { gammaToSteer } from '../app/src/main/assets/web/shared/steering.js'

describe('gammaToSteer', () => {
  it('retorna 0 no neutro', () => {
    expect(gammaToSteer(0)).toBe(0)
  })
  it('retorna 0 dentro da zona morta', () => {
    expect(gammaToSteer(2, { deadzone: 3 })).toBe(0)
  })
  it('retorna +1 no ângulo máximo positivo', () => {
    expect(gammaToSteer(35, { maxAngle: 35, deadzone: 3 })).toBeCloseTo(1)
  })
  it('faz clamp acima do máximo', () => {
    expect(gammaToSteer(80, { maxAngle: 35 })).toBeCloseTo(1)
  })
  it('espelha para o lado negativo', () => {
    expect(gammaToSteer(-35, { maxAngle: 35, deadzone: 3 })).toBeCloseTo(-1)
  })
  it('respeita o neutro calibrado', () => {
    expect(gammaToSteer(20, { neutral: 20, deadzone: 3 })).toBe(0)
  })
})
