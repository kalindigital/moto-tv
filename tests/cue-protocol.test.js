import { describe, it, expect } from 'vitest'
import {
  serializePick,
  serializeAim,
  serializeShoot,
  serializePlace,
  serializeTurn,
  serializeSinucaSetup,
  serializeJoin,
  serializeAssign,
  serializeMode,
  serializeHit,
  parseMessage,
} from '../app/src/main/assets/web/shared/cue-protocol.js'

describe('cue-protocol · pick de jogo', () => {
  it('serializa a escolha do jogo', () => {
    expect(JSON.parse(serializePick('sinuca'))).toEqual({ t: 'pick', game: 'sinuca' })
    expect(JSON.parse(serializePick('moto'))).toEqual({ t: 'pick', game: 'moto' })
  })
  it('parseia pick de jogo válido', () => {
    expect(parseMessage('{"t":"pick","game":"sinuca"}')).toEqual({ type: 'pick', game: 'sinuca' })
    expect(parseMessage('{"t":"pick","game":"moto"}')).toEqual({ type: 'pick', game: 'moto' })
  })
  it('jogo desconhecido vira unknown', () => {
    expect(parseMessage('{"t":"pick","game":"xadrez"}')).toEqual({ type: 'unknown' })
    expect(parseMessage('{"t":"pick"}')).toEqual({ type: 'unknown' })
  })
})

describe('cue-protocol · mira (aim) e tacada (shoot)', () => {
  it('serializa aim com ângulo e força', () => {
    expect(JSON.parse(serializeAim(1.5, 0.4))).toEqual({ t: 'aim', a: 1.5, p: 0.4 })
  })
  it('serializa shoot com ângulo e força', () => {
    expect(JSON.parse(serializeShoot(-2, 1))).toEqual({ t: 'shoot', a: -2, p: 1 })
  })
  it('parseia aim e faz clamp da força em [0,1]', () => {
    expect(parseMessage('{"t":"aim","a":0.5,"p":0.3}')).toEqual({ type: 'aim', angle: 0.5, power: 0.3 })
    expect(parseMessage('{"t":"aim","a":0.5,"p":2}')).toEqual({ type: 'aim', angle: 0.5, power: 1 })
    expect(parseMessage('{"t":"aim","a":0.5,"p":-3}')).toEqual({ type: 'aim', angle: 0.5, power: 0 })
  })
  it('parseia shoot e faz clamp da força em [0,1]', () => {
    expect(parseMessage('{"t":"shoot","a":3.14,"p":0.9}')).toEqual({ type: 'shoot', angle: 3.14, power: 0.9 })
    expect(parseMessage('{"t":"shoot","a":3.14,"p":9}')).toEqual({ type: 'shoot', angle: 3.14, power: 1 })
  })
  it('aim/shoot sem números viram unknown', () => {
    expect(parseMessage('{"t":"aim","a":"x","p":0.3}')).toEqual({ type: 'unknown' })
    expect(parseMessage('{"t":"shoot","a":1}')).toEqual({ type: 'unknown' })
    expect(parseMessage('{"t":"aim"}')).toEqual({ type: 'unknown' })
  })
  it('ida e volta serialize→parse', () => {
    expect(parseMessage(serializeShoot(1.2, 0.75))).toEqual({ type: 'shoot', angle: 1.2, power: 0.75 })
  })
})

describe('cue-protocol · bola na mão (place)', () => {
  it('serializa a posição normalizada', () => {
    expect(JSON.parse(serializePlace(0.25, 0.5))).toEqual({ t: 'place', x: 0.25, y: 0.5 })
  })
  it('parseia place e faz clamp de x,y em [0,1]', () => {
    expect(parseMessage('{"t":"place","x":0.2,"y":0.8}')).toEqual({ type: 'place', x: 0.2, y: 0.8 })
    expect(parseMessage('{"t":"place","x":1.5,"y":-0.3}')).toEqual({ type: 'place', x: 1, y: 0 })
  })
  it('place sem números vira unknown', () => {
    expect(parseMessage('{"t":"place","x":"a","y":0.2}')).toEqual({ type: 'unknown' })
    expect(parseMessage('{"t":"place"}')).toEqual({ type: 'unknown' })
  })
})

describe('cue-protocol · aparência da sinuca (taco/mesa)', () => {
  it('serializa a aparência escolhida', () => {
    expect(JSON.parse(serializeSinucaSetup('grafite', 'azul')))
      .toEqual({ t: 'sinucaSetup', taco: 'grafite', mesa: 'azul' })
  })
  it('parseia a aparência', () => {
    expect(parseMessage('{"t":"sinucaSetup","taco":"vermelho","mesa":"vinho"}'))
      .toEqual({ type: 'sinucaSetup', taco: 'vermelho', mesa: 'vinho' })
  })
  it('valores inválidos caem no padrão (classico/verde)', () => {
    expect(parseMessage('{"t":"sinucaSetup","taco":"x","mesa":"y"}'))
      .toEqual({ type: 'sinucaSetup', taco: 'classico', mesa: 'verde' })
    expect(parseMessage('{"t":"sinucaSetup"}'))
      .toEqual({ type: 'sinucaSetup', taco: 'classico', mesa: 'verde' })
  })
})

describe('cue-protocol · estado do turno (jogo → celular)', () => {
  it('serializa o turno', () => {
    expect(JSON.parse(serializeTurn({ player: 2, group: 'stripe', ballInHand: true, phase: 'playing', winner: null })))
      .toEqual({ t: 'turn', player: 2, group: 'stripe', ballInHand: true, phase: 'playing', winner: null })
  })
  it('parseia o turno', () => {
    expect(parseMessage('{"t":"turn","player":1,"group":null,"ballInHand":false,"phase":"playing","winner":null}'))
      .toEqual({ type: 'turn', player: 1, group: null, ballInHand: false, phase: 'playing', winner: null })
  })
  it('parseia gameover com vencedor', () => {
    expect(parseMessage('{"t":"turn","player":1,"group":"solid","ballInHand":false,"phase":"gameover","winner":1}'))
      .toEqual({ type: 'turn', player: 1, group: 'solid', ballInHand: false, phase: 'gameover', winner: 1 })
  })
  it('turno com player inválido vira unknown', () => {
    expect(parseMessage('{"t":"turn","player":3}')).toEqual({ type: 'unknown' })
  })
})

describe('cue-protocol · lobby de 2 celulares', () => {
  it('serializa e parseia join', () => {
    expect(JSON.parse(serializeJoin('abc'))).toEqual({ t: 'join', id: 'abc' })
    expect(parseMessage('{"t":"join","id":"abc"}')).toEqual({ type: 'join', id: 'abc' })
  })
  it('join sem id vira unknown', () => {
    expect(parseMessage('{"t":"join"}')).toEqual({ type: 'unknown' })
  })
  it('serializa e parseia assign', () => {
    expect(JSON.parse(serializeAssign('abc', 2))).toEqual({ t: 'assign', id: 'abc', player: 2 })
    expect(parseMessage('{"t":"assign","id":"abc","player":1}')).toEqual({ type: 'assign', id: 'abc', player: 1 })
  })
  it('assign com player inválido vira unknown', () => {
    expect(parseMessage('{"t":"assign","id":"abc","player":3}')).toEqual({ type: 'unknown' })
  })
  it('aim/shoot/place carregam o id do controle quando informado', () => {
    expect(JSON.parse(serializeShoot(1, 0.5, 'abc'))).toEqual({ t: 'shoot', a: 1, p: 0.5, id: 'abc' })
    expect(parseMessage('{"t":"shoot","a":1,"p":0.5,"id":"abc"}')).toEqual({ type: 'shoot', angle: 1, power: 0.5, id: 'abc' })
    expect(parseMessage('{"t":"aim","a":0,"p":0.2,"id":"z"}')).toEqual({ type: 'aim', angle: 0, power: 0.2, id: 'z' })
    expect(parseMessage('{"t":"place","x":0.2,"y":0.3,"id":"z"}')).toEqual({ type: 'place', x: 0.2, y: 0.3, id: 'z' })
  })
  it('sem id, aim/shoot/place seguem sem a chave id (compatível)', () => {
    expect(parseMessage('{"t":"shoot","a":1,"p":0.5}')).toEqual({ type: 'shoot', angle: 1, power: 0.5 })
  })
  it('turno pode indicar o controle da vez (cid)', () => {
    expect(JSON.parse(serializeTurn({ player: 1, group: null, ballInHand: false, phase: 'playing', winner: null, controllerId: 'abc' })))
      .toEqual({ t: 'turn', player: 1, group: null, ballInHand: false, phase: 'playing', winner: null, cid: 'abc' })
    expect(parseMessage('{"t":"turn","player":1,"phase":"playing","cid":"abc"}'))
      .toMatchObject({ type: 'turn', player: 1, controllerId: 'abc' })
  })
})

describe('cue-protocol · modo de jogo (sozinho x multiplayer)', () => {
  it('serializa o modo com a dificuldade', () => {
    expect(JSON.parse(serializeMode('solo', 'facil'))).toEqual({ t: 'mode', mode: 'solo', dif: 'facil' })
    expect(JSON.parse(serializeMode('multi'))).toEqual({ t: 'mode', mode: 'multi', dif: 'medio' })
  })
  it('parseia o modo e a dificuldade', () => {
    expect(parseMessage('{"t":"mode","mode":"solo","dif":"dificil"}'))
      .toEqual({ type: 'mode', mode: 'solo', dificuldade: 'dificil' })
    expect(parseMessage('{"t":"mode","mode":"multi","dif":"medio"}'))
      .toEqual({ type: 'mode', mode: 'multi', dificuldade: 'medio' })
  })
  it('dificuldade ausente ou inválida cai no intermediário', () => {
    expect(parseMessage('{"t":"mode","mode":"solo"}'))
      .toEqual({ type: 'mode', mode: 'solo', dificuldade: 'medio' })
    expect(parseMessage('{"t":"mode","mode":"solo","dif":"impossivel"}'))
      .toEqual({ type: 'mode', mode: 'solo', dificuldade: 'medio' })
  })
  it('modo desconhecido vira unknown', () => {
    expect(parseMessage('{"t":"mode","mode":"coop"}')).toEqual({ type: 'unknown' })
    expect(parseMessage('{"t":"mode"}')).toEqual({ type: 'unknown' })
  })
})

describe('cue-protocol · efeito (onde o taco bate na branca)', () => {
  it('aim e shoot levam o ponto de contato quando informado', () => {
    expect(JSON.parse(serializeShoot(1, 0.5, 'abc', { x: 0.4, y: -0.6 })))
      .toEqual({ t: 'shoot', a: 1, p: 0.5, id: 'abc', sx: 0.4, sy: -0.6 })
    expect(parseMessage('{"t":"shoot","a":1,"p":0.5,"sx":0.4,"sy":-0.6}'))
      .toEqual({ type: 'shoot', angle: 1, power: 0.5, efeito: { x: 0.4, y: -0.6 } })
  })
  it('faz clamp do efeito em [-1,1]', () => {
    expect(parseMessage('{"t":"aim","a":0,"p":0.2,"sx":9,"sy":-9}'))
      .toEqual({ type: 'aim', angle: 0, power: 0.2, efeito: { x: 1, y: -1 } })
  })
  it('sem efeito informado, a tacada segue sem a chave (compatível)', () => {
    expect(parseMessage('{"t":"shoot","a":1,"p":0.5}'))
      .toEqual({ type: 'shoot', angle: 1, power: 0.5 })
  })
})

describe('cue-protocol · impacto (TV → celular, para vibrar)', () => {
  it('serializa e parseia o impacto com intensidade', () => {
    expect(JSON.parse(serializeHit(0.7))).toEqual({ t: 'hit', p: 0.7 })
    expect(parseMessage('{"t":"hit","p":0.7}')).toEqual({ type: 'hit', power: 0.7 })
  })
  it('faz clamp da intensidade em [0,1]', () => {
    expect(parseMessage('{"t":"hit","p":5}')).toEqual({ type: 'hit', power: 1 })
    expect(parseMessage('{"t":"hit","p":-2}')).toEqual({ type: 'hit', power: 0 })
  })
  it('impacto sem número vira unknown', () => {
    expect(parseMessage('{"t":"hit"}')).toEqual({ type: 'unknown' })
  })
})

describe('cue-protocol · ações e lixo', () => {
  it('parseia action (reinício, qr, pausa)', () => {
    expect(parseMessage('{"t":"action","name":"restart"}')).toEqual({ type: 'action', name: 'restart' })
    expect(parseMessage('{"t":"action","name":"qr"}')).toEqual({ type: 'action', name: 'qr' })
  })
  it('lixo e JSON inválido viram unknown', () => {
    expect(parseMessage('{"t":"zzz"}')).toEqual({ type: 'unknown' })
    expect(parseMessage('não é json')).toEqual({ type: 'unknown' })
  })
})
