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
    expect(parseMessage('{"t":"setup","periodo":"dia"}')).toEqual({ type: 'setup', periodo: 'dia', moto: null })
    expect(parseMessage('{"t":"setup","periodo":"noite"}')).toEqual({ type: 'setup', periodo: 'noite', moto: null })
  })
  it('setup com período inválido vira unknown', () => {
    expect(parseMessage('{"t":"setup","periodo":"tarde"}')).toEqual({ type: 'unknown' })
    expect(parseMessage('{"t":"setup","periodo":""}')).toEqual({ type: 'unknown' })
    expect(parseMessage('{"t":"setup","periodo":123}')).toEqual({ type: 'unknown' })
    expect(parseMessage('{"t":"setup"}')).toEqual({ type: 'unknown' })
  })
})

describe('protocol · setup com escolha de moto', () => {
  it('serializa a moto quando informada', () => {
    expect(JSON.parse(serializeSetup('dia', 'sk'))).toEqual({ t: 'setup', periodo: 'dia', moto: 'sk' })
    expect(JSON.parse(serializeSetup('noite', 'kawasaki'))).toEqual({ t: 'setup', periodo: 'noite', moto: 'kawasaki' })
    expect(JSON.parse(serializeSetup('dia', 'classica'))).toEqual({ t: 'setup', periodo: 'dia', moto: 'classica' })
  })
  it('omite a moto quando ausente ou desconhecida (compatível com o formato antigo)', () => {
    expect(JSON.parse(serializeSetup('dia'))).toEqual({ t: 'setup', periodo: 'dia' })
    expect(JSON.parse(serializeSetup('dia', null))).toEqual({ t: 'setup', periodo: 'dia' })
    expect(JSON.parse(serializeSetup('dia', 'ducati'))).toEqual({ t: 'setup', periodo: 'dia' })
  })
  it('parseia a moto quando presente', () => {
    expect(parseMessage('{"t":"setup","periodo":"dia","moto":"sk"}'))
      .toEqual({ type: 'setup', periodo: 'dia', moto: 'sk' })
    expect(parseMessage('{"t":"setup","periodo":"noite","moto":"kawasaki"}'))
      .toEqual({ type: 'setup', periodo: 'noite', moto: 'kawasaki' })
    expect(parseMessage('{"t":"setup","periodo":"noite","moto":"classica"}'))
      .toEqual({ type: 'setup', periodo: 'noite', moto: 'classica' })
  })
  it('moto desconhecida ou de tipo errado vira null, sem invalidar o setup', () => {
    expect(parseMessage('{"t":"setup","periodo":"dia","moto":"ducati"}'))
      .toEqual({ type: 'setup', periodo: 'dia', moto: null })
    expect(parseMessage('{"t":"setup","periodo":"dia","moto":7}'))
      .toEqual({ type: 'setup', periodo: 'dia', moto: null })
    expect(parseMessage('{"t":"setup","periodo":"dia","moto":null}'))
      .toEqual({ type: 'setup', periodo: 'dia', moto: null })
  })
  it('período inválido continua unknown mesmo com moto válida', () => {
    expect(parseMessage('{"t":"setup","periodo":"tarde","moto":"sk"}')).toEqual({ type: 'unknown' })
  })
  it('ida e volta entre serialize e parse', () => {
    expect(parseMessage(serializeSetup('noite', 'classica')))
      .toEqual({ type: 'setup', periodo: 'noite', moto: 'classica' })
    expect(parseMessage(serializeSetup('dia')))
      .toEqual({ type: 'setup', periodo: 'dia', moto: null })
  })
})
