/**
 * Qualidade adaptativa.
 *
 * A TV do usuário não é a máquina onde o jogo foi escrito: o mesmo cenário que
 * roda liso no emulador pode não caber no orçamento de uma GPU de TV. Em vez de
 * chutar um nível fixo, o jogo MEDE o FPS e desce de nível sozinho quando a
 * média cai — e só sobe de novo quando sobra folga.
 *
 * Este módulo é só a decisão: não conhece THREE, DOM nem localStorage. Quem
 * chama passa o `dt` de cada quadro e recebe o novo nível quando ele muda.
 *
 * Regras que evitam o pior defeito de um sistema assim, o ping-pong entre dois
 * níveis:
 *  - histerese: cai abaixo de 45 fps, sobe só acima de 57;
 *  - tempo mínimo em cada direção (2 s para cair, 8 s para subir);
 *  - carência após cada troca (recompilar shader dá engasgo que não conta);
 *  - nível de onde já se caiu fica REPROVADO e não é tentado de novo na sessão.
 */

// Do mais leve para o mais pesado — a ordem é o que define subir e descer.
export const NIVEIS = ['baixo', 'medio', 'alto']

/**
 * O que cada nível controla. `densidade` é o índice usado pelo cenário (0 = só
 * o essencial, 2 = tudo); `nevoa` multiplica a distância de névoa, que é também
 * o alcance da câmera — menos névoa significa menos mundo desenhado.
 */
export const PERFIS = {
  baixo: {
    rotulo: 'baixo',
    escalaRender: 0.55,
    densidade: 0,
    nevoa: 0.62,
    veiculos: 4,
    farolReal: false,
  },
  medio: {
    rotulo: 'médio',
    escalaRender: 0.75,
    densidade: 1,
    nevoa: 0.82,
    veiculos: 6,
    farolReal: false,
  },
  alto: {
    rotulo: 'alto',
    escalaRender: 1,
    densidade: 2,
    nevoa: 1,
    veiculos: 8,
    farolReal: true,
  },
}

export const NIVEL_PADRAO = 'medio'

const JANELA = 0.5          // s de cada amostra de FPS
const FPS_QUEDA = 45        // média abaixo disso é considerada ruim
const FPS_SUBIDA = 57       // média acima disso é folga de verdade
const SEG_QUEDA = 2         // s de média ruim antes de descer
const SEG_SUBIDA = 8        // s de média boa antes de subir
const CARENCIA = 1.5        // s ignorados depois de trocar de nível
const DT_MAX = 0.25         // quadro mais longo que isso é pausa/carga, não lag
const PESO = 0.45           // peso da amostra nova na média móvel

/** Nível conhecido ou o padrão — protege contra localStorage adulterado. */
export function nivelValido(nome) {
  return NIVEIS.includes(nome) ? nome : NIVEL_PADRAO
}

/**
 * Cria o controle. `quadro(dt)` devolve o nome do novo nível quando ele muda e
 * null no resto do tempo, então quem chama só reage à troca.
 */
export function criarQualidade(nivelInicial = NIVEL_PADRAO) {
  let nivel = nivelValido(nivelInicial)
  let media = (FPS_QUEDA + FPS_SUBIDA) / 2
  let quadros = 0
  let acumulado = 0
  let ruim = 0
  let bom = 0
  let carencia = CARENCIA
  const reprovados = new Set()

  function trocar(novo) {
    nivel = novo
    ruim = 0
    bom = 0
    carencia = CARENCIA
    // Média neutra: o nível novo é julgado pelo que ele mede, não pelo anterior.
    media = (FPS_QUEDA + FPS_SUBIDA) / 2
    return novo
  }

  return {
    get nivel() { return nivel },
    get perfil() { return PERFIS[nivel] },
    /** Média móvel de FPS, para o contador na tela. */
    get fps() { return media },

    quadro(dt) {
      if (!(dt > 0) || dt > DT_MAX) return null
      if (carencia > 0) { carencia -= dt; return null }

      quadros += 1
      acumulado += dt
      if (acumulado < JANELA) return null

      const amostra = quadros / acumulado
      media += (amostra - media) * PESO
      const passo = acumulado
      quadros = 0
      acumulado = 0

      if (media < FPS_QUEDA) { ruim += passo; bom = 0 } else if (media > FPS_SUBIDA) { bom += passo; ruim = 0 } else { ruim = 0; bom = 0 }

      if (ruim >= SEG_QUEDA) {
        const abaixo = NIVEIS[NIVEIS.indexOf(nivel) - 1]
        ruim = 0
        // Já no mínimo: não há para onde descer, mas o nível atual fica marcado
        // para nunca mais ser alvo de subida.
        if (!abaixo) return null
        reprovados.add(nivel)
        return trocar(abaixo)
      }

      if (bom >= SEG_SUBIDA) {
        const acima = NIVEIS[NIVEIS.indexOf(nivel) + 1]
        bom = 0
        if (!acima || reprovados.has(acima)) return null
        return trocar(acima)
      }

      return null
    },
  }
}
