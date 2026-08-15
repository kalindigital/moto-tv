import * as THREE from '../vendor/three.module.js'
import { pegarCenario, definirLuzesVeiculos } from './models.js'

/**
 * Ambiente da corrida: pista, faixas, chão, luzes e a beira de estrada que
 * rola junto. Tudo é criado uma única vez; trocar entre dia e noite só mexe em
 * cor, névoa e intensidade de luz — nenhum objeto é destruído ou recriado, que
 * é a forma mais barata (e sem vazamento) de fazer a troca numa TV.
 */

export const LARGURA_PISTA = 12
export const FAIXAS = [-3.4, 0, 3.4]      // centro de cada faixa de rolamento
export const LIMITE_X = 4.6               // até onde a moto pode ir

const COMPRIMENTO_PISTA = 420
const VAO = 168                            // ciclo de reciclagem dos objetos
const FIM = 12                             // z a partir do qual o objeto volta

const PALETA = {
  dia: {
    ceu: 0x8ec8ff,
    nevoa: 0xa9d6ff,
    nevoaPerto: 60,
    nevoaLonge: 190,
    asfalto: 0x4e5158,
    faixa: 0xf2f2e8,
    chao: 0x4f7a3f,
    hemi: [0xcfe8ff, 0x5d7a45, 1.15],
    sol: [0xfff4dd, 1.6],
    posicaoSol: [24, 40, 10],
    ambiente: 0,
    poste: 0,
    farolMoto: 0,
  },
  noite: {
    ceu: 0x060912,
    nevoa: 0x070b18,
    nevoaPerto: 20,
    nevoaLonge: 95,
    asfalto: 0x1b1c22,
    faixa: 0xb9bcae,
    chao: 0x121a12,
    hemi: [0x2b3a63, 0x0a0d14, 0.35],
    sol: [0x9db4ff, 0.28],
    posicaoSol: [-30, 46, -14],
    ambiente: 0.22,
    poste: 26,
    farolMoto: 3.2,
  },
}

/**
 * Distribuição fixa dos objetos de beira de pista ao longo do vão. Postes
 * alternam de lado a cada 24 unidades; árvores e barreiras preenchem o meio.
 */
function planoDeBeira() {
  const itens = []
  let i = 0
  for (let z = 0; z > -VAO; z -= 24, i++) {
    itens.push({ tipo: 'lightPostModern', z, lado: i % 2 === 0 ? 1 : -1 })
  }
  i = 0
  for (let z = -6; z > -VAO; z -= 14, i++) {
    const lado = i % 2 === 0 ? 1 : -1
    itens.push({ tipo: i % 3 === 0 ? 'treeSmall' : 'treeLarge', z, lado })
    itens.push({ tipo: 'treeLarge', z: z - 5, lado: -lado })
  }
  for (let z = -2; z > -VAO; z -= 21) {
    itens.push({ tipo: 'barrierWhite', z, lado: 1 })
    itens.push({ tipo: 'fenceStraight', z: z - 10, lado: -1 })
  }
  return itens
}

export function criarCenario(scene, periodo = 'dia') {
  const descartaveis = []
  const registrarGeo = (g) => { descartaveis.push(g); return g }

  // ------------------------------------------------------------ luzes (poucas)
  const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 1)
  scene.add(hemi)
  const sol = new THREE.DirectionalLight(0xffffff, 1)
  scene.add(sol)
  const ambiente = new THREE.AmbientLight(0x2a3a66, 0)
  scene.add(ambiente)

  // ------------------------------------------------------------------- pista
  const matAsfalto = new THREE.MeshLambertMaterial({ color: 0x4e5158 })
  const pista = new THREE.Mesh(
    registrarGeo(new THREE.PlaneGeometry(LARGURA_PISTA, COMPRIMENTO_PISTA)), matAsfalto,
  )
  pista.rotation.x = -Math.PI / 2
  pista.position.z = -COMPRIMENTO_PISTA / 2 + 40
  pista.frustumCulled = false   // plano enorme: nunca deve ser descartado
  scene.add(pista)

  const matChao = new THREE.MeshLambertMaterial({ color: 0x4f7a3f })
  const chao = new THREE.Mesh(
    registrarGeo(new THREE.PlaneGeometry(240, COMPRIMENTO_PISTA)), matChao,
  )
  chao.rotation.x = -Math.PI / 2
  chao.position.set(0, -0.6, pista.position.z)   // longe da pista: evita z-fighting na TV
  scene.add(chao)

  // bordas contínuas (não precisam rolar: são retas infinitas na prática)
  const matFaixa = new THREE.MeshLambertMaterial({ color: 0xf2f2e8 })
  const geoBorda = registrarGeo(new THREE.BoxGeometry(0.22, 0.02, COMPRIMENTO_PISTA))
  const bordas = []
  for (const lado of [-1, 1]) {
    const borda = new THREE.Mesh(geoBorda, matFaixa)
    borda.position.set(lado * (LARGURA_PISTA / 2 - 0.35), 0.015, pista.position.z)
    scene.add(borda)
    bordas.push(borda)
  }

  // ---------------------------------------------- faixas tracejadas (rolam)
  const geoFaixa = registrarGeo(new THREE.BoxGeometry(0.2, 0.02, 3.2))
  const tracos = []
  for (const x of [-1.7, 1.7]) {
    for (let i = 0; i < 22; i++) {
      const t = new THREE.Mesh(geoFaixa, matFaixa)
      t.position.set(x, 0.016, FIM - i * 8)
      scene.add(t)
      tracos.push(t)
    }
  }

  // ------------------------------------------------------- beira de estrada
  const props = []
  const luzesPoste = []
  const matLampada = new THREE.MeshBasicMaterial({ color: 0xffd9a0 })
  matLampada.visible = false
  const geoLampada = registrarGeo(new THREE.SphereGeometry(0.28, 8, 6))
  let nPostes = 0

  for (const item of planoDeBeira()) {
    const modelo = pegarCenario(item.tipo)
    if (!modelo) continue
    const g = modelo.objeto
    const poste = item.tipo === 'lightPostModern'
    // Postes ficam rente ao asfalto (o braço avança sobre a pista); árvores e
    // cercas recuam para não parecerem obstáculo.
    const dist = poste ? LARGURA_PISTA / 2 + 0.9 : LARGURA_PISTA / 2 + 3.4 + Math.random() * 5
    g.position.set(item.lado * dist, 0, item.z)
    // O braço do poste nasce em +Z; girar 90° joga a lâmpada sobre a pista.
    // Árvores giram à toa (dá variedade); barreiras e cercas ficam retas.
    if (poste) g.rotation.y = item.lado * -Math.PI / 2
    else if (item.tipo.startsWith('tree')) g.rotation.y = Math.random() * Math.PI * 2

    if (poste) {
      const lampada = new THREE.Mesh(geoLampada, matLampada)
      lampada.position.set(0, modelo.altura * 0.93, modelo.profundidade * 0.40)
      g.add(lampada)
      // Um poste sim, um não ganha luz real (no máximo 3): numa TV cada
      // PointLight extra encarece o shader de todo objeto iluminado.
      nPostes += 1
      if (nPostes % 2 === 1 && luzesPoste.length < 3) {
        const luz = new THREE.PointLight(0xffb46b, 0, 32, 1.5)
        luz.position.set(0, modelo.altura * 0.88, modelo.profundidade * 0.40)
        g.add(luz)
        luzesPoste.push(luz)
      }
    }
    scene.add(g)
    props.push(g)
  }

  // ------------------------------------------------------------------- ciclo
  const cenario = {
    periodo,
    /** Farol da moto; game.js liga aqui a moto assim que ela existe. */
    farolMoto: null,

    /** Rola o mundo `dz` unidades em direção à câmera, reciclando o que passou. */
    atualizar(dz) {
      for (const t of tracos) {
        t.position.z += dz
        if (t.position.z > FIM) t.position.z -= 176
      }
      for (const p of props) {
        p.position.z += dz
        if (p.position.z > FIM) p.position.z -= VAO
      }
    },

    definirPeriodo(novo) {
      const p = PALETA[novo] || PALETA.dia
      cenario.periodo = PALETA[novo] ? novo : 'dia'

      scene.background = new THREE.Color(p.ceu)
      if (scene.fog) {
        scene.fog.color.setHex(p.nevoa)
        scene.fog.near = p.nevoaPerto
        scene.fog.far = p.nevoaLonge
      } else {
        scene.fog = new THREE.Fog(p.nevoa, p.nevoaPerto, p.nevoaLonge)
      }

      hemi.color.setHex(p.hemi[0])
      hemi.groundColor.setHex(p.hemi[1])
      hemi.intensity = p.hemi[2]
      sol.color.setHex(p.sol[0])
      sol.intensity = p.sol[1]
      sol.position.set(p.posicaoSol[0], p.posicaoSol[1], p.posicaoSol[2])
      ambiente.intensity = p.ambiente

      matAsfalto.color.setHex(p.asfalto)
      matChao.color.setHex(p.chao)
      matFaixa.color.setHex(p.faixa)

      matLampada.visible = p.poste > 0
      for (const luz of luzesPoste) luz.intensity = p.poste
      definirLuzesVeiculos(p.poste > 0)
      if (cenario.farolMoto) cenario.farolMoto.intensity = p.farolMoto
    },

    /** Escurece tudo na pausa sem mexer na paleta guardada. */
    definirEscurecido(escuro) {
      const k = escuro ? 0.25 : 1
      const p = PALETA[cenario.periodo]
      hemi.intensity = p.hemi[2] * k
      sol.intensity = p.sol[1] * k
      ambiente.intensity = p.ambiente * k
      for (const luz of luzesPoste) luz.intensity = p.poste * k
    },

    dispose() {
      for (const o of [pista, chao, hemi, sol, ambiente]) scene.remove(o)
      for (const b of bordas) scene.remove(b)
      for (const t of tracos) scene.remove(t)
      for (const p of props) scene.remove(p)
      for (const g of descartaveis) g.dispose()
      for (const m of [matAsfalto, matChao, matFaixa, matLampada]) m.dispose()
    },
  }

  cenario.definirPeriodo(periodo)
  return cenario
}
