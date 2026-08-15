# Sinuca no Moto TV — app multijogo (design/plano)

Data: 2026-08-15

## Objetivo

Adicionar um jogo de **sinuca (8-ball) top view** ao app Moto TV, reaproveitando
toda a infraestrutura existente (servidor local HTTPS + relay WebSocket + página
de controle + QR + build/auto-update). O app deixa de abrir direto no jogo da
moto e passa a mostrar um **menu** (Moto / Sinuca). O celular é o controle; na
sinuca é possível jogar com **dois celulares**, um por jogador.

## Por que assim (decisões)

- **Um só app** (não um projeto separado): o `/ws` já é um relay puro e os assets
  são servidos genericamente de `web/`, então a sinuca é essencialmente conteúdo
  web novo. A única mudança no Kotlin é a raiz `/` redirecionar para `/menu`.
- **Canvas 2D** (não Three.js): sinuca top view é 2D; render procedural mantém o
  app offline e leve, como o resto do projeto (nada é baixado em runtime).
- **Lógica pura testável**: física e regras vivem em `shared/` e são cobertas por
  Vitest; o arquivo do jogo só orquestra, desenha e sonoriza.

## Arquitetura

```
TV: /menu ─(escolha)→ /game (moto)  ou  /sinuca (8-ball, canvas 2D)
        ▲                                   ▲
        │ pick(game)                        │ aim/shoot/place/join (celular → TV)
        │                                   │ turn/assign        (TV → celular)
   Celular: /controle ── seletor ── moto-controle.js | sinuca-controle.js
```

- **Servidor (Kotlin)**: sem novidades além de `RouteResolver`: `/ → /menu/index.html`.
  O relay repassa qualquer frame de texto entre os peers (celular ↔ TV, TV ↔ celular).
- **shared/billiards.js** (puro): `collideElastic`, `reflectCushion`, `stepBall`,
  `pocketed`, `allAtRest`. O laço do jogo compõe com sub-passos para não “atravessar”
  bolas em alta velocidade.
- **shared/pool-rules.js** (puro): máquina de estados do 8-ball — quebra, mesa
  aberta → grupos na 1ª encaçapada legal, faltas (bola errada, sem tabela após o
  contato, scratch da branca, 8 fora de hora), bola na mão, vitória/derrota.
- **shared/cue-protocol.js**: mensagens da sinuca — `pick`, `aim`, `shoot`,
  `place`, `sinucaSetup` (taco/mesa), `turn` (TV→celular, com `cid` = controle da
  vez), `join`/`assign` (lobby de 2 jogadores). Não toca no `protocol.js` da moto.
- **sinuca/**: `sinuca.js` (motor/orquestração), `mesa.js` (geometria + desenho),
  `audio.js` (som procedural: taco, choque, tabela, caçapa).
- **controle/**: `controle.js` (seletor), `moto-controle.js` (moto, intacto +
  botão Sair), `sinuca-controle.js` (estilingue + aparência + lobby).

## Modo 2 celulares (lobby)

- Cada celular gera um `id` (uuid) por carregamento. Ao entrar, manda `join(id)`;
  a TV atribui o **primeiro slot livre** (Jogador 1, depois Jogador 2) e devolve
  `assign(id, player)`. O `join` é reenviado até receber o `assign` (a página do
  jogo pode carregar depois do celular).
- As jogadas carregam o `id`. A TV só aceita a jogada do **dono da vez**; se o
  slot daquele jogador estiver vazio, **qualquer** controle joga (assim um celular
  só também funciona — hotseat).
- A TV informa no `turn` qual é o `cid` (controle) da vez; o celular trava o pad
  quando não é a sua vez (“Aguarde a vez do Jogador X”).
- O Jogador 1 escolhe a aparência (taco/mesa) e começa; o Jogador 2 entra direto
  no pad.

## Controle “estilingue”

No celular, arrasta o dedo para trás (mira/força) e solta para tacar. Envia
`aim` ao vivo (preview na TV) e `shoot` ao soltar. Bola na mão: botão
“Posicionar branca” abre a mini-mesa para tocar onde colocar (`place`).

## Regra da casa

- 8 na quebra: **vitória** (a menos que scratch junto).
- Bola na mão em qualquer falta (regra BCA), posicionável em qualquer ponto livre.

## Testes

- Vitest: `billiards` (15), `pool-rules` (17), `cue-protocol` (28) — além das
  suítes antigas da moto, todas verdes.
- JUnit: `RouteResolverTest` atualizado (raiz → menu); demais suítes verdes.
- Render/toque real: validação manual na TV (não automatizável de forma confiável).

## Build e instalação

- APK: `./gradlew assembleDebug` → `app/build/outputs/apk/debug/app-debug.apk`.
- Instalar na TV por depuração (sem copiar APK na mão): habilitar Depuração de
  rede na TV, `adb connect <ip-da-tv>:5555` e `./gradlew installDebug`
  (ou `adb install -r <apk>`). Se já houver uma versão assinada com outra chave,
  desinstalar antes (`adb uninstall com.mototv`).
