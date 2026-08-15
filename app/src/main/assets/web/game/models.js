import * as THREE from '../vendor/three.module.js'
import { GLTFLoader } from '../vendor/GLTFLoader.js'

/**
 * Catálogo de modelos 3D do jogo.
 *
 * Os GLB são do kit CC0 da Kenney: eixo Y para cima, frente em +Z e escala
 * própria (um sedan tem 2,54 de comprimento). Aqui tudo é normalizado uma vez
 * na carga — escala pelo comprimento/altura alvo, centro em X/Z e rodas
 * apoiadas em y=0 — para o jogo poder posicionar qualquer veículo sem saber de
 * onde ele veio.
 *
 * Os clones compartilham geometria e material com o protótipo (é o que
 * Object3D.clone faz), então ter dezenas de veículos custa quase nada de
 * memória. Nenhuma alocação acontece por frame: o jogo clona só ao montar o
 * pool.
 */

// A frente dos modelos Kenney aponta para +Z (grade e rodas dianteiras em z>0),
// que é justamente a direção da câmera — o tráfego já vem de cara para o jogador.
export const NOMES_CARROS = [
  'sedan', 'sedan-sports', 'hatchback-sports', 'suv', 'taxi', 'police', 'van',
]
export const NOMES_CAMINHOES = [
  'truck', 'truck-flat', 'delivery', 'garbage-truck', 'firetruck',
]
export const NOMES_CENARIO = [
  'lightPostModern', 'treeLarge', 'treeSmall', 'barrierWhite', 'fenceStraight',
]

// Comprimento alvo em unidades de mundo (a pista tem 12 de largura).
const COMPRIMENTO_CARRO = 3.7
const COMPRIMENTO_CAMINHAO = 6.0

// Cenário é normalizado pela ALTURA: os kits vêm em escalas bem diferentes
// entre si (o poste tem 0,78 de altura; a cerca, 0,50).
const ALTURA_CENARIO = {
  lightPostModern: 5.6,
  treeLarge: 6.4,
  treeSmall: 3.8,
  barrierWhite: 1.0,
  fenceStraight: 1.4,
}

/** Preenchido por carregarModelos(); pegarCarro/pegarCaminhao leem daqui. */
let registro = null

// ---------------------------------------------------------------- utilidades

const _caixa = new THREE.Box3()
const _tamanho = new THREE.Vector3()
const _centro = new THREE.Vector3()

/**
 * Escala o objeto para um tamanho alvo e o embrulha num grupo cujo (0,0,0)
 * fica no chão, no centro do veículo. `eixo` diz qual dimensão vira a medida.
 */
function normalizar(raiz, alvo, eixo) {
  _caixa.setFromObject(raiz)
  _caixa.getSize(_tamanho)
  const atual = eixo === 'y' ? _tamanho.y : _tamanho.z
  const escala = atual > 0.0001 ? alvo / atual : 1
  raiz.scale.setScalar(escala)
  raiz.updateMatrixWorld(true)

  _caixa.setFromObject(raiz)
  _caixa.getSize(_tamanho)
  _caixa.getCenter(_centro)
  // Deslocamento relativo: o GLB pode já trazer a raiz fora da origem.
  raiz.position.set(
    raiz.position.x - _centro.x,
    raiz.position.y - _caixa.min.y,
    raiz.position.z - _centro.z,
  )

  const grupo = new THREE.Group()
  grupo.add(raiz)
  return {
    objeto: grupo,
    largura: _tamanho.x,
    altura: _tamanho.y,
    profundidade: _tamanho.z,
  }
}

/** Materiais do GLTF vêm com doubleSided; o corte de face economiza fill rate. */
function otimizarMateriais(raiz) {
  raiz.traverse((n) => {
    if (!n.isMesh) return
    n.castShadow = false
    n.receiveShadow = false
    n.frustumCulled = true
    const mats = Array.isArray(n.material) ? n.material : [n.material]
    for (const m of mats) {
      if (!m) continue
      m.side = THREE.FrontSide
    }
  })
}

// ------------------------------------------------------------------- luzinhas

// Geometria e materiais das lanternas são únicos e compartilhados por todos os
// veículos do pool.
const GEO_LUZ = new THREE.PlaneGeometry(1, 1)
const MAT_FAROL = new THREE.MeshBasicMaterial({ color: 0xfff2cc, transparent: true, opacity: 0.9 })
const MAT_LANTERNA = new THREE.MeshBasicMaterial({ color: 0xff2f2f, transparent: true, opacity: 0.9 })

/**
 * Faróis (frente, +Z) e lanternas (traseira, -Z) como placas emissivas.
 * De dia ficam invisíveis; à noite o cenário liga tudo de uma vez, porque os
 * materiais são compartilhados.
 */
function adicionarLuzes(grupo, largura, altura, profundidade) {
  const y = altura * 0.42
  const meia = largura * 0.32
  for (const lado of [-1, 1]) {
    const farol = new THREE.Mesh(GEO_LUZ, MAT_FAROL)
    farol.scale.set(largura * 0.22, altura * 0.11, 1)
    farol.position.set(lado * meia, y, profundidade / 2 + 0.02)
    grupo.add(farol)

    const lanterna = new THREE.Mesh(GEO_LUZ, MAT_LANTERNA)
    lanterna.scale.set(largura * 0.18, altura * 0.09, 1)
    lanterna.position.set(lado * meia, y, -profundidade / 2 - 0.02)
    lanterna.rotation.y = Math.PI
    grupo.add(lanterna)
  }
}

/** Liga/desliga as luzinhas de todos os veículos de uma vez (dia/noite). */
export function definirLuzesVeiculos(ligadas) {
  MAT_FAROL.opacity = ligadas ? 0.95 : 0
  MAT_LANTERNA.opacity = ligadas ? 0.9 : 0
  MAT_FAROL.visible = ligadas
  MAT_LANTERNA.visible = ligadas
}

// --------------------------------------------------------------------- carga

function carregarUm(loader, nome) {
  return new Promise((resolve) => {
    try {
      loader.load(
        `/models/${nome}.glb`,
        (gltf) => resolve(gltf.scene),
        undefined,
        () => resolve(null), // 404 (o modelo é opcional) não derruba o jogo
      )
    } catch (e) {
      resolve(null)
    }
  })
}

/**
 * Carrega todos os GLB uma única vez. `aoProgredir(fracao, nome)` é chamado a
 * cada arquivo pronto para a tela de carregamento andar.
 */
export async function carregarModelos(aoProgredir) {
  const loader = new GLTFLoader()
  const nomes = [...NOMES_CARROS, ...NOMES_CAMINHOES, ...NOMES_CENARIO]
  let prontos = 0

  const cenas = await Promise.all(nomes.map(async (nome) => {
    const cena = await carregarUm(loader, nome)
    prontos += 1
    if (aoProgredir) aoProgredir(prontos / nomes.length, nome)
    return [nome, cena]
  }))

  const carros = []
  const caminhoes = []
  const cenario = {}

  for (const [nome, cena] of cenas) {
    if (!cena) continue
    otimizarMateriais(cena)
    if (NOMES_CENARIO.includes(nome)) {
      cenario[nome] = normalizar(cena, ALTURA_CENARIO[nome] || 3, 'y')
      continue
    }
    const caminhao = NOMES_CAMINHOES.includes(nome)
    const alvo = caminhao ? COMPRIMENTO_CAMINHAO : COMPRIMENTO_CARRO
    const pronto = { nome, ...normalizar(cena, alvo, 'z') }
    ;(caminhao ? caminhoes : carros).push(pronto)
  }

  registro = { carros, caminhoes, cenario }
  return registro
}

export function temModelos() {
  return !!registro && registro.carros.length > 0
}

// ------------------------------------------------------------- pegar veículo

// Hitbox um pouco menor que o desenho: encostar de raspão não deve matar.
const FOLGA_HITBOX = 0.82

function clonarVeiculo(lista, tipo) {
  if (!lista || lista.length === 0) return null
  const base = lista[(Math.random() * lista.length) | 0]
  const objeto = base.objeto.clone(true)
  adicionarLuzes(objeto, base.largura, base.altura, base.profundidade)
  return {
    nome: base.nome,
    tipo,
    objeto,
    hitbox: {
      w: base.largura * FOLGA_HITBOX,
      d: base.profundidade * FOLGA_HITBOX,
    },
  }
}

/** Clone de um carro aleatório, já com tipo e hitbox derivada da bounding box. */
export function pegarCarro() {
  return clonarVeiculo(registro && registro.carros, 'carro')
}

/** Clone de um caminhão aleatório (visivelmente maior que os carros). */
export function pegarCaminhao() {
  return clonarVeiculo(registro && registro.caminhoes, 'caminhao')
}

/** Clone de um item de cenário já normalizado pela altura. */
export function pegarCenario(nome) {
  const base = registro && registro.cenario[nome]
  if (!base) return null
  return {
    objeto: base.objeto.clone(true),
    largura: base.largura,
    altura: base.altura,
    profundidade: base.profundidade,
  }
}

// ----------------------------------------------------------------- a MOTO

// Materiais da moto: criados uma vez, compartilhados entre as peças.
const MAT = {
  pintura: new THREE.MeshStandardMaterial({ color: 0x6e29f6, metalness: 0.72, roughness: 0.26 }),
  pinturaEscura: new THREE.MeshStandardMaterial({ color: 0x241043, metalness: 0.6, roughness: 0.4 }),
  motor: new THREE.MeshStandardMaterial({ color: 0x2b2f3a, metalness: 0.85, roughness: 0.35 }),
  cromo: new THREE.MeshStandardMaterial({ color: 0xced5e0, metalness: 1, roughness: 0.16 }),
  pneu: new THREE.MeshStandardMaterial({ color: 0x131318, metalness: 0.1, roughness: 0.92 }),
  aro: new THREE.MeshStandardMaterial({ color: 0xb7bdc8, metalness: 0.95, roughness: 0.22 }),
  couro: new THREE.MeshStandardMaterial({ color: 0x0e0e14, metalness: 0.2, roughness: 0.8 }),
  vidro: new THREE.MeshStandardMaterial({
    color: 0x9fd8ff, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.42,
  }),
  farol: new THREE.MeshBasicMaterial({ color: 0xfff4d0 }),
  lanterna: new THREE.MeshBasicMaterial({ color: 0xff2222 }),
  macacao: new THREE.MeshStandardMaterial({ color: 0x191d2a, metalness: 0.2, roughness: 0.7 }),
  capacete: new THREE.MeshStandardMaterial({ color: 0xf1f3f8, metalness: 0.4, roughness: 0.25 }),
  viseira: new THREE.MeshStandardMaterial({ color: 0x120a24, metalness: 0.9, roughness: 0.1 }),
}

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _eixo = new THREE.Vector3()

/** Cilindro ligando dois pontos — serve para braços, pernas e garfo. */
function cilindroEntre(ax, ay, az, bx, by, bz, raio, material) {
  _a.set(ax, ay, az)
  _b.set(bx, by, bz)
  _eixo.subVectors(_b, _a)
  const comprimento = _eixo.length()
  const malha = new THREE.Mesh(new THREE.CylinderGeometry(raio, raio, comprimento, 7), material)
  malha.position.copy(_a).addScaledVector(_eixo, 0.5)
  malha.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _eixo.normalize())
  return malha
}

function caixa(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  m.position.set(x, y, z)
  return m
}

/**
 * Moto esportiva desenhada no código. A câmera fica ATRÁS, então o que precisa
 * ler bem é a traseira: rabeta erguida, lanterna vermelha, escapamentos, o
 * piloto debruçado e as pontas do guidão/retrovisores aparecendo de lado.
 * O nariz aponta para -Z (o sentido em que a moto anda).
 */
function motoProcedural() {
  const moto = new THREE.Group()
  const add = (m) => { moto.add(m); return m }

  // --- rodas
  const geoPneuFrente = new THREE.CylinderGeometry(0.33, 0.33, 0.15, 14)
  const geoPneuTras = new THREE.CylinderGeometry(0.36, 0.36, 0.21, 14)
  const geoAro = new THREE.CylinderGeometry(0.19, 0.19, 0.16, 9)

  const rodaFrente = new THREE.Mesh(geoPneuFrente, MAT.pneu)
  rodaFrente.rotation.z = Math.PI / 2
  rodaFrente.position.set(0, 0.33, -0.82)
  add(rodaFrente)
  const aroFrente = new THREE.Mesh(geoAro, MAT.aro)
  aroFrente.rotation.z = Math.PI / 2
  aroFrente.position.copy(rodaFrente.position)
  add(aroFrente)

  const rodaTras = new THREE.Mesh(geoPneuTras, MAT.pneu)
  rodaTras.rotation.z = Math.PI / 2
  rodaTras.position.set(0, 0.36, 0.78)
  add(rodaTras)
  const aroTras = new THREE.Mesh(geoAro, MAT.aro)
  aroTras.rotation.z = Math.PI / 2
  aroTras.position.copy(rodaTras.position)
  add(aroTras)

  // --- garfo dianteiro e balança traseira
  add(cilindroEntre(-0.14, 0.33, -0.82, -0.13, 0.95, -0.60, 0.035, MAT.cromo))
  add(cilindroEntre(0.14, 0.33, -0.82, 0.13, 0.95, -0.60, 0.035, MAT.cromo))
  add(cilindroEntre(-0.19, 0.36, 0.78, -0.14, 0.46, 0.24, 0.045, MAT.motor))
  add(cilindroEntre(0.19, 0.36, 0.78, 0.14, 0.46, 0.24, 0.045, MAT.motor))

  // --- carenagem: nariz cônico apontando para -Z
  const nariz = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.31, 0.86, 9), MAT.pintura)
  nariz.rotation.x = -Math.PI / 2
  nariz.position.set(0, 0.70, -0.70)
  add(nariz)

  // laterais da carenagem
  add(caixa(0.44, 0.34, 0.5, MAT.pintura, 0, 0.62, -0.22))

  // --- tanque (esfera achatada dá o volume arredondado sem custo)
  const tanque = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6), MAT.pintura)
  tanque.scale.set(0.42, 0.27, 0.62)
  tanque.position.set(0, 0.88, 0.02)
  add(tanque)

  // --- motor e escapamentos
  add(caixa(0.36, 0.32, 0.46, MAT.motor, 0, 0.52, 0.06))
  for (const lado of [-1, 1]) {
    const escape = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.62, 8), MAT.cromo)
    escape.rotation.x = Math.PI / 2
    escape.position.set(lado * 0.19, 0.47, 0.62)
    add(escape)
  }

  // --- assento e rabeta erguida
  add(caixa(0.30, 0.10, 0.54, MAT.couro, 0, 0.94, 0.30))
  const rabeta = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.21, 0.58, 7), MAT.pintura)
  rabeta.rotation.x = Math.PI / 2 - 0.22
  rabeta.position.set(0, 1.02, 0.66)
  add(rabeta)
  add(caixa(0.26, 0.05, 0.30, MAT.pinturaEscura, 0, 1.08, 0.72))

  // --- para-brisa
  const brisa = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.24), MAT.vidro)
  brisa.position.set(0, 1.00, -0.74)
  brisa.rotation.x = 0.85
  brisa.material.side = THREE.DoubleSide
  add(brisa)

  // --- guidão, manoplas e retrovisores
  const guidao = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.62, 7), MAT.cromo)
  guidao.rotation.z = Math.PI / 2
  guidao.position.set(0, 1.00, -0.58)
  add(guidao)
  for (const lado of [-1, 1]) {
    const manopla = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.13, 7), MAT.couro)
    manopla.rotation.z = Math.PI / 2
    manopla.position.set(lado * 0.27, 1.00, -0.58)
    add(manopla)
    add(caixa(0.13, 0.05, 0.05, MAT.pinturaEscura, lado * 0.30, 1.10, -0.66))
  }

  // --- farol e lanterna
  const farol = caixa(0.24, 0.13, 0.05, MAT.farol, 0, 0.74, -1.06)
  farol.rotation.x = -0.2
  add(farol)
  add(caixa(0.15, 0.06, 0.04, MAT.lanterna, 0, 1.06, 0.92))

  // --- piloto debruçado sobre o tanque
  const tronco = caixa(0.34, 0.48, 0.28, MAT.macacao, 0, 1.16, 0.16)
  tronco.rotation.x = -0.6
  add(tronco)
  const capacete = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), MAT.capacete)
  capacete.position.set(0, 1.38, -0.16)
  add(capacete)
  const viseira = new THREE.Mesh(new THREE.SphereGeometry(0.172, 12, 8, 0, Math.PI * 2, 0.9, 0.7), MAT.viseira)
  viseira.position.copy(capacete.position)
  viseira.rotation.x = -1.15
  add(viseira)
  // corcova do macacão nas costas: é o que mais se vê de trás
  const corcova = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6), MAT.macacao)
  corcova.scale.set(0.24, 0.16, 0.22)
  corcova.position.set(0, 1.32, 0.06)
  add(corcova)

  for (const lado of [-1, 1]) {
    add(cilindroEntre(lado * 0.16, 1.30, -0.02, lado * 0.27, 1.02, -0.54, 0.055, MAT.macacao))
    add(cilindroEntre(lado * 0.13, 1.02, 0.30, lado * 0.23, 0.78, 0.06, 0.075, MAT.macacao))
    add(cilindroEntre(lado * 0.23, 0.78, 0.06, lado * 0.21, 0.48, 0.26, 0.06, MAT.macacao))
  }

  return moto
}

/**
 * Devolve a moto do jogador. Se existir /models/moto.glb, ele manda; senão a
 * moto é construída no código. Em qualquer caso o resultado tem o mesmo
 * contrato: grupo com origem no chão, nariz em -Z e um farol (SpotLight) que
 * o cenário noturno acende.
 */
export async function criarMoto() {
  const loader = new GLTFLoader()
  const cena = await carregarUm(loader, 'moto')

  let moto
  if (cena) {
    otimizarMateriais(cena)
    // Se veio do disco, a frente do modelo (+Z, padrão do kit) tem de virar -Z.
    cena.rotation.y = Math.PI
    moto = normalizar(cena, 2.2, 'z').objeto
  } else {
    moto = motoProcedural()
  }

  // Um único SpotLight: à noite ele é o farol; de dia fica apagado.
  const farol = new THREE.SpotLight(0xfff0cc, 0, 46, 0.42, 0.55, 1.1)
  farol.position.set(0, 0.85, -1.0)
  const alvo = new THREE.Object3D()
  alvo.position.set(0, 0.0, -18)
  moto.add(alvo)
  farol.target = alvo
  moto.add(farol)
  moto.userData.farol = farol
  moto.userData.hitbox = { w: 0.7, d: 1.9 }
  return moto
}
