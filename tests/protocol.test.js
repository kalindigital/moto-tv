import { describe, it, expect } from 'vitest'
import { serializeSteer, serializeAction, parseMessage } from '../app/src/main/assets/web/shared/protocol.js'

describe('protocol', () => {
  it('serializa steer', () => {
    expect(JSON.parse(serializeSteer(0.5))).toEqual({ t: 'steer', v: 0.5 })
  })
  it('serializa action', () => {
    expect(JSON.parse(serializeAction('restart'))).toEqual({ t: 'action', name: 'restart' })
  })
  it('parseia steer e faz clamp em [-1,1]', () => {
    expect(parseMessage('{"t":"steer","v":2}')).toEqual({ type: 'steer', value: 1 })
    expect(parseMessage('{"t":"steer","v":-9}')).toEqual({ type: 'steer', value: -1 })
  })
  it('parseia action', () => {
    expect(parseMessage('{"t":"action","name":"restart"}')).toEqual({ type: 'action', name: 'restart' })
  })
  it('retorna unknown para lixo', () => {
    expect(parseMessage('{"t":"xpto"}')).toEqual({ type: 'unknown' })
  })
})
