import { describe, it, expect } from 'vitest'
import {
  serializeSteer,
  serializeAction,
  serializeThrottle,
  serializeSetup,
  parseMessage,
} from '../app/src/main/assets/web/shared/protocol.js'

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

describe('protocol · acelerador', () => {
  it('serializa throttle ligado e desligado', () => {
    expect(JSON.parse(serializeThrottle(true))).toEqual({ t: 'throttle', v: true })
    expect(JSON.parse(serializeThrottle(false))).toEqual({ t: 'throttle', v: false })
  })
  it('parseia throttle', () => {
    expect(parseMessage('{"t":"throttle","v":true}')).toEqual({ type: 'throttle', ativo: true })
    expect(parseMessage('{"t":"throttle","v":false}')).toEqual({ type: 'throttle', ativo: false })
  })
  it('throttle com valor não booleano vira unknown', () => {
    expect(parseMessage('{"t":"throttle","v":1}')).toEqual({ type: 'unknown' })
    expect(parseMessage('{"t":"throttle","v":"true"}')).toEqual({ type: 'unknown' })
    expect(parseMessage('{"t":"throttle"}')).toEqual({ type: 'unknown' })
  })
})

describe('protocol · setup de período', () => {
  it('serializa setup', () => {
    expect(JSON.parse(serializeSetup('dia'))).toEqual({ t: 'setup', periodo: 'dia' })
    expect(JSON.parse(serializeSetup('noite'))).toEqual({ t: 'setup', periodo: 'noite' })
  })
  it('parseia setup dia e noite', () => {
    expect(parseMessage('{"t":"setup","periodo":"dia"}')).toEqual({ type: 'setup', periodo: 'dia' })
    expect(parseMessage('{"t":"setup","periodo":"noite"}')).toEqual({ type: 'setup', periodo: 'noite' })
  })
  it('setup com período inválido vira unknown', () => {
    expect(parseMessage('{"t":"setup","periodo":"tarde"}')).toEqual({ type: 'unknown' })
    expect(parseMessage('{"t":"setup","periodo":""}')).toEqual({ type: 'unknown' })
    expect(parseMessage('{"t":"setup","periodo":123}')).toEqual({ type: 'unknown' })
    expect(parseMessage('{"t":"setup"}')).toEqual({ type: 'unknown' })
  })
})
