import { describe, it, expect } from 'vitest'
import { aabbOverlap } from '../app/src/main/assets/web/shared/collision.js'

const box = (x, z) => ({ x, z, w: 2, d: 2 })

describe('aabbOverlap', () => {
  it('detecta sobreposição', () => {
    expect(aabbOverlap(box(0, 0), box(1, 1))).toBe(true)
  })
  it('separado no eixo x → false', () => {
    expect(aabbOverlap(box(0, 0), box(3, 0))).toBe(false)
  })
  it('separado no eixo z → false', () => {
    expect(aabbOverlap(box(0, 0), box(0, 3))).toBe(false)
  })
  it('encostando na borda não conta', () => {
    expect(aabbOverlap(box(0, 0), box(2, 0))).toBe(false)
  })
})
