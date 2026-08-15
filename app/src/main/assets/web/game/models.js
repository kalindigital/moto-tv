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
 *
 * Devolve também a `raiz` (com `matrixWorld` já atualizada) e a `escala`
 * aplicada: quem precisa achar uma peça DENTRO do modelo (as rodas da moto) ou
 * medir algo já na escala final lê daqui, sem refazer conta.
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
  grupo.updateMatrixWorld(true)
  return {
    objeto: grupo,
    raiz,
    escala,
    largura: _tamanho.x,
    altura: _tamanho.y,
    profundidade: _tamanho.z,
  }
}

/**
 * Materiais do GLTF vêm com doubleSided; o corte de face economiza fill rate.
 * Também trocamos PBR (MeshStandard) por Lambert: os modelos da Kenney são
 * coloridos por atlas, não usam metalness/roughness de verdade, e o cálculo de
 * iluminação física por pixel era caro demais para a GPU da TV. Cache por
 * material de origem para não recriar (nem quebrar o compartilhamento).
 */
const _lambertCache = new Map()

function paraLambert(m) {
  if (!m || !m.isMeshStandardMaterial) return m
  if (_lambertCache.has(m)) return _lambertCache.get(m)
  const barato = new THREE.MeshLambertMaterial({
    color: m.color,
    map: m.map || null,
    emissive: m.emissive || 0x000000,
    emissiveMap: m.emissiveMap || null,
    emissiveIntensity: m.emissiveIntensity ?? 1,
    transparent: m.transparent,
    opacity: m.opacity,
    vertexColors: m.vertexColors,
    side: THREE.FrontSide,
  })
  _lambertCache.set(m, barato)
  return barato
}

function otimizarMateriais(raiz) {
  raiz.traverse((n) => {
    if (!n.isMesh) return
    n.castShadow = false
    n.receiveShadow = false
    n.frustumCulled = true
    if (Array.isArray(n.material)) {
      n.material = n.material.map((m) => { const b = paraLambert(m); if (b) b.side = THREE.FrontSide; return b })
    } else if (n.material) {
      n.material = paraLambert(n.material)
      n.material.side = THREE.FrontSide
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

/** Carrega um GLB por URL. Falha (404, arquivo corrompido) devolve null. */
function carregarGlb(loader, url) {
  return new Promise((resolve) => {
    try {
      loader.load(
        url,
        (gltf) => resolve(gltf.scene),
        undefined,
        () => resolve(null), // 404 (o modelo é opcional) não derruba o jogo
      )
    } catch (e) {
      resolve(null)
    }
  })
}

function carregarUm(loader, nome) {
  return carregarGlb(loader, `/models/${nome}.glb`)
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
  // O tráfego anda no MESMO sentido que a moto: vemos a traseira dos veículos
  // (e, à noite, as lanternas vermelhas em vez dos faróis).
  objeto.rotation.y += Math.PI
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

// ---------------------------------------------------------------- as MOTOS

/**
 * Catálogo de motos selecionáveis (o celular manda o id no `setup`).
 *
 * A NORMALIZAÇÃO é o mecanismo principal, igual para todas: escala pelo
 * COMPRIMENTO (uma moto tem de ser visivelmente menor e mais estreita que um
 * carro de 3,7), meia volta quando o modelo nasce olhando para +Z (o jogo anda
 * para -Z e a câmera fica atrás, então o jogador vê a traseira) e translação
 * para o centro em X/Z e as rodas em y=0. Tudo sai da bounding box medida.
 *
 * Em cima disso, cada moto traz uns poucos ajustes: onde fica o assento e a
 * lanterna. São FRAÇÕES da caixa normalizada (x=0 é o centro; z>0 é a traseira,
 * porque o nariz aponta para -Z), então acompanham a escala sozinhas — não são
 * offsets em unidades de mundo chutados para um tamanho específico. A clássica,
 * desenhada no código, dá o assento como ponto exato no seu próprio modelo.
 */

// Ponto onde o piloto encosta o traseiro na moto clássica: é a origem em que
// ele foi desenhado. Serve de assento exato só para ela.
const ASSENTO_CLASSICA = [0, 0.99, 0.30]

// Altura normalizada da moto clássica (medida uma vez). O piloto foi desenhado
// no tamanho dela, então escala pela razão de altura: moto mais baixa recebe
// piloto proporcionalmente menor, senão as pernas ficam penduradas fora.
const ALTURA_REF = 1.13

const CATALOGO_MOTOS = {
  classica: {
    rotulo: 'Clássica',
    // Desenhada no código, já com o nariz em -Z e as rodas em y=0.
    assentoModelo: ASSENTO_CLASSICA,
  },
  sk: {
    rotulo: 'Esportiva',
    arquivo: '/models/motos/sk-bike.glb',
    // Rodas dianteira (z=+1,08) e traseira (z=-0,74): a frente nasce em +Z.
    frenteZ: 1,
    texturas: {
      map: '/models/motos/bike01_BC.jpg',
      normalMap: '/models/motos/bike01_N.jpg',
      roughnessMap: '/models/motos/bike01_R.jpg',
      metalnessMap: '/models/motos/bike01_M.jpg',
    },
    rodas: ['SK_rsg_LastGuns_bike_Front_Wheel', 'SK_rsg_LastGuns_bike_Back_Wheel'],
    // Assento (banco a ~50% da altura, um tico atrás do centro) e lanterna
    // (rabeta, mais alta e bem na traseira) como frações da caixa.
    assento: { y: 0.50, z: 0.08 },
    lanterna: { y: 0.54, z: 0.42 },
    // A carenagem dianteira alta infla a altura da caixa; o piloto encolhe um
    // pouco para não ficar gigante em cima do banco.
    escalaPiloto: 0.9,
    // Guidão de moto naked fica alto: o piloto senta mais ereto.
    inclinacaoPiloto: 0.26,
  },
  kawasaki: {
    rotulo: 'Ninja',
    arquivo: '/models/motos/kawasaki.glb',
    // Malha única sem UV: o nariz do modelo já aponta para -Z.
    frenteZ: -1,
    // Sem textura embutida: só resta pintura. Verde Ninja com um emissivo
    // baixinho para a silhueta não sumir de noite.
    pintura: {
      color: 0x5fc94b, metalness: 0.6, roughness: 0.35, emissive: 0x0b2a12,
    },
    // Esportiva baixa: o vão do tanque/banco fica no centro da caixa, então o
    // assento é quase central. Carenagem agressiva pede o piloto debruçado.
    assento: { y: 0.58, z: 0.02 },
    lanterna: { y: 0.60, z: 0.44 },
    inclinacaoPiloto: -0.05,
  },
}

export const MOTOS_DISPONIVEIS = Object.keys(CATALOGO_MOTOS)
export const MOTO_PADRAO = 'classica'

// Comprimento alvo da moto em unidades de mundo (o carro tem 3,7).
const COMPRIMENTO_MOTO = 2.05

// Hitbox da moto: bem mais estreita que a caixa desenhada (guidão e
// retrovisores não podem matar) e quase do comprimento inteiro.
const FOLGA_MOTO_X = 0.75
const FOLGA_MOTO_Z = 0.92

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
 * Moto clássica desenhada no código, SEM o piloto (ele é montado à parte para
 * poder sentar em qualquer uma das motos). A câmera fica ATRÁS, então o que
 * precisa ler bem é a traseira: rabeta erguida, lanterna vermelha, escapamentos
 * e as pontas do guidão/retrovisores aparecendo de lado. O nariz aponta para
 * -Z (o sentido em que a moto anda).
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

  return moto
}

/**
 * Piloto debruçado sobre o tanque, montado com a ORIGEM NO ASSENTO. As peças
 * seguem as coordenadas em que ele foi desenhado (sobre a moto clássica); um
 * grupo interno desloca tudo para o assento cair em (0,0,0). Assim basta
 * posicionar o piloto no assento de qualquer moto para ele sentar direito.
 */
function pilotoProcedural() {
  const piloto = new THREE.Group()
  const interno = new THREE.Group()
  interno.position.set(-ASSENTO_CLASSICA[0], -ASSENTO_CLASSICA[1], -ASSENTO_CLASSICA[2])
  piloto.add(interno)
  const add = (m) => { interno.add(m); return m }

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

  return piloto
}

// ------------------------------------------------------- motos vindas de GLB

/** Textura do disco: `cor` marca as que carregam cor (sRGB) e não dados. */
function carregarTextura(loader, url, cor) {
  return new Promise((resolve) => {
    try {
      loader.load(url, (t) => {
        t.colorSpace = cor ? THREE.SRGBColorSpace : THREE.NoColorSpace
        t.flipY = false           // as UVs vêm do GLB, que usa origem no topo
        t.anisotropy = 4
        resolve(t)
      }, undefined, () => resolve(null))
    } catch (e) {
      resolve(null)
    }
  })
}

/** Material da moto com os quatro mapas do disco (base, normal, rugosidade, metal). */
async function materialTexturizado(cfg, descartaveis) {
  const loader = new THREE.TextureLoader()
  const t = cfg.texturas
  const [map, normalMap, roughnessMap, metalnessMap] = await Promise.all([
    carregarTextura(loader, t.map, true),
    carregarTextura(loader, t.normalMap, false),
    carregarTextura(loader, t.roughnessMap, false),
    carregarTextura(loader, t.metalnessMap, false),
  ])
  for (const tex of [map, normalMap, roughnessMap, metalnessMap]) {
    if (tex) descartaveis.push(tex)
  }
  // Com mapa, o fator vira multiplicador: 1 deixa o mapa mandar sozinho.
  const material = new THREE.MeshStandardMaterial({
    map,
    normalMap,
    roughnessMap,
    metalnessMap,
    color: map ? 0xffffff : 0x8d94a3,
    roughness: roughnessMap ? 1 : 0.45,
    metalness: metalnessMap ? 1 : 0.5,
  })
  descartaveis.push(material)
  return material
}

/** Material da moto sem textura nenhuma: pintura metálica de uma cor só. */
function materialPintado(cfg, descartaveis) {
  const material = new THREE.MeshStandardMaterial(cfg.pintura)
  descartaveis.push(material)
  return material
}

/**
 * Carrega o GLB da moto, troca todos os materiais pelo nosso (os modelos vêm
 * sem textura embutida) e normaliza pela bounding box.
 */
async function montarMotoGlb(cfg, descartaveis) {
  const cena = await carregarGlb(new GLTFLoader(), cfg.arquivo)
  if (!cena) return null

  const material = cfg.texturas
    ? await materialTexturizado(cfg, descartaveis)
    : materialPintado(cfg, descartaveis)

  cena.traverse((n) => {
    if (!n.isMesh) return
    n.castShadow = false
    n.receiveShadow = false
    n.frustumCulled = true
    // Os materiais que vieram do GLTF morrem aqui: ninguém mais aponta para eles.
    for (const m of (Array.isArray(n.material) ? n.material : [n.material])) {
      if (m) m.dispose()
    }
    n.material = material
  })

  // O jogo anda para -Z; modelo que nasce olhando para +Z leva meia volta.
  if (cfg.frenteZ > 0) cena.rotation.y = Math.PI
  return normalizar(cena, COMPRIMENTO_MOTO, 'z')
}

/**
 * Acha as malhas de roda pelo nome e mede o raio de cada uma na escala final.
 * Girar em torno do +X local (a roda é um cilindro com o eixo em X e o centro
 * na origem do próprio nó) faz o pneu rodar no lugar.
 */
function acharRodas(raiz, cfg) {
  const rodas = []
  for (const nome of cfg.rodas || []) {
    const objeto = raiz.getObjectByName(nome)
    if (!objeto) continue
    _caixa.setFromObject(objeto)
    _caixa.getSize(_tamanho)
    const raio = Math.max(_tamanho.y, _tamanho.z) / 2
    if (raio > 0.01) rodas.push({ objeto, raio })
  }
  return rodas
}

const _ponto = new THREE.Vector3()

/** Leva um ponto medido no modelo para as coordenadas finais da moto. */
function pontoDoModelo(raiz, p) {
  return _ponto.set(p[0], p[1], p[2]).applyMatrix4(raiz.matrixWorld)
}

/**
 * Onde o piloto senta, em coordenadas já normalizadas. A clássica dá um ponto
 * exato no seu modelo; as de GLB dão frações da caixa (x=0 centro, z>0 traseira).
 */
function pontoAssento(cfg, raiz, largura, altura, profundidade) {
  if (cfg.assentoModelo) return pontoDoModelo(raiz, cfg.assentoModelo).clone()
  const f = cfg.assento || { y: 0.5, z: 0.05 }
  return new THREE.Vector3(0, altura * f.y, profundidade * (f.z || 0))
}

/**
 * Devolve a moto do jogador já montada: modelo normalizado, piloto sentado,
 * farol (SpotLight que o cenário noturno acende), lanterna e hitbox tirada da
 * bounding box. `id` é um dos MOTOS_DISPONIVEIS; id desconhecido (ou GLB que
 * não carregou) cai na moto clássica, desenhada no código.
 */
export async function criarMoto(id = MOTO_PADRAO) {
  let cfg = CATALOGO_MOTOS[id] || CATALOGO_MOTOS[MOTO_PADRAO]
  let escolhida = CATALOGO_MOTOS[id] ? id : MOTO_PADRAO
  const descartaveis = []

  let base = cfg.arquivo ? await montarMotoGlb(cfg, descartaveis) : null
  if (!base) {
    cfg = CATALOGO_MOTOS[MOTO_PADRAO]
    escolhida = MOTO_PADRAO
    base = normalizar(motoProcedural(), COMPRIMENTO_MOTO, 'z')
  }

  const { objeto: moto, raiz, largura, altura, profundidade } = base

  // --- piloto no assento, escalado pela razão de altura da moto (bbox)
  const assento = pontoAssento(cfg, raiz, largura, altura, profundidade)
  const piloto = pilotoProcedural()
  piloto.position.copy(assento)
  piloto.scale.setScalar((altura / ALTURA_REF) * (cfg.escalaPiloto || 1))
  // Guidão alto (naked) deixa o piloto ereto; carenagem (esportiva) o debruça.
  piloto.rotation.x = cfg.inclinacaoPiloto || 0
  moto.add(piloto)

  // --- lanterna traseira (as motos de GLB não têm; a clássica já tem a dela)
  if (cfg.lanterna) {
    const geo = new THREE.PlaneGeometry(largura * 0.22, altura * 0.06)
    const mat = new THREE.MeshBasicMaterial({ color: 0xff2222 })
    descartaveis.push(geo, mat)
    const lanterna = new THREE.Mesh(geo, mat)
    lanterna.position.set(0, altura * cfg.lanterna.y, profundidade * cfg.lanterna.z)
    moto.add(lanterna)      // plano nasce olhando para +Z, que é a câmera
  }

  // Um único SpotLight: à noite ele é o farol; de dia fica apagado.
  const farol = new THREE.SpotLight(0xfff0cc, 0, 46, 0.42, 0.55, 1.1)
  farol.position.set(0, altura * 0.55, -profundidade / 2 + 0.08)
  const alvo = new THREE.Object3D()
  alvo.position.set(0, 0.0, -18)
  moto.add(alvo)
  farol.target = alvo
  moto.add(farol)

  moto.userData.farol = farol
  moto.userData.moto = escolhida
  moto.userData.rodas = acharRodas(raiz, cfg)
  moto.userData.hitbox = { w: largura * FOLGA_MOTO_X, d: profundidade * FOLGA_MOTO_Z }
  moto.userData.descartaveis = descartaveis
  return moto
}

/**
 * Gira as rodas que são malhas separadas, proporcional à distância percorrida
 * (ângulo = distância / raio). Motos de peça única simplesmente não têm rodas
 * registradas e a chamada não faz nada.
 */
export function girarRodas(moto, distancia) {
  const rodas = moto && moto.userData.rodas
  if (!rodas || rodas.length === 0) return
  for (const roda of rodas) {
    // Andar para -Z (frente) roda o topo do pneu para -Z: rotação negativa em X.
    const angulo = roda.objeto.rotation.x - distancia / roda.raio
    roda.objeto.rotation.x = angulo % (Math.PI * 2)
  }
}

/**
 * Devolve à GPU tudo que era exclusivo desta moto. As geometrias sempre são
 * (nenhuma moto compartilha malha com outra coisa); materiais e texturas só os
 * que foram criados para ela — os MAT.* do desenho procedural são
 * compartilhados e continuam vivos.
 */
export function descartarMoto(moto) {
  if (!moto) return
  if (moto.parent) moto.parent.remove(moto)
  moto.traverse((n) => {
    if (n.isMesh && n.geometry) n.geometry.dispose()
  })
  for (const recurso of moto.userData.descartaveis || []) {
    if (recurso && typeof recurso.dispose === 'function') recurso.dispose()
  }
  moto.userData.descartaveis = []
  moto.userData.rodas = []
  moto.userData.farol = null
}
