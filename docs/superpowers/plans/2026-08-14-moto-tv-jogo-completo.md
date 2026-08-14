# Moto TV — Onda 2: jogo completo (gráficos, som, pontuação, ranking)

**Objetivo:** transformar o protótipo num jogo com cara de jogo: moto esportiva, carros e
caminhões, paisagem dia/noite, som de motor, acelerador no celular, pausa, pontuação com
ranking e tela de fim de jogo.

**Base:** app Android TV (WebView + NanoHTTPD HTTPS na 8444) já funcionando; jogo em
Three.js nos assets; controle no iPhone via `gamma` + WebSocket.

## Requisitos (do usuário)

1. Moto **esportiva** com gráfico melhor.
2. **Som de motor** (reage à velocidade/aceleração).
3. **Acelerar** pelo celular (botão).
4. **Pausar** o jogo (botão no celular).
5. Obstáculos: **carros e caminhões**, com gráficos melhores e silhuetas distintas.
6. Paisagem **dia e noite**, escolhida **no celular antes de começar**.
7. **Pontuação:** carro ultrapassado +1; caminhão +2 (dobro); **×2 enquanto acelerando**.
8. Ao bater: tela de **"Bateu!"** com pontuação, recorde e **ranking**; pontuações **salvas**.
9. **QR não aparece** na tela de colisão; volta por um **botão**.
10. Visual geral com **cara de app de jogo**.

## Decisões técnicas

- **Modelos:** geometria procedural low-poly no Three.js (grupos de meshes), não `.glb`
  externo — mantém offline, leve, sem licença de terceiros.
- **Som:** síntese WebAudio (osciladores + filtro), frequência ligada à velocidade. Sem
  arquivo de áudio. Só inicia após interação (política de autoplay) — o primeiro comando do
  celular serve de gesto.
- **Persistência:** `localStorage` na WebView da TV (top 10 + data).
- **Protocolo:** estender as mensagens existentes, mantendo compatibilidade:
  - `{"t":"steer","v":-1..1}` (já existe)
  - `{"t":"throttle","v":true|false}` (acelerador)
  - `{"t":"action","name":"restart"|"pause"|"resume"|"qr"}`
  - `{"t":"setup","periodo":"dia"|"noite"}` (antes de começar)

## Estrutura de arquivos

```
app/src/main/assets/web/
├── shared/
│   ├── protocol.js      (estender: throttle, setup, novas actions)
│   └── scoring.js       (NOVO: pontos por tipo, multiplicador, ranking — puro/testável)
├── game/
│   ├── index.html       (HUD, telas, estilos de "app de jogo")
│   ├── game.js          (orquestração e estados)
│   ├── models.js        (NOVO: moto, carro, caminhão, cenário dia/noite)
│   └── audio.js         (NOVO: motor via WebAudio)
└── controle/
    ├── index.html       (acelerador, pausar, dia/noite, reiniciar, QR)
    └── controle.js
tests/
├── protocol.test.js     (estender)
└── scoring.test.js      (NOVO)
```

## Tarefas

### Task 1 — Protocolo + Scoring (lógica pura, TDD)
- `protocol.js`: `serializeThrottle(bool)`, `serializeSetup(periodo)`, parse dos novos tipos,
  mantendo `steer`/`action` intactos e `{type:'unknown'}` para lixo.
- `scoring.js`:
  - `pontosPor(tipo, acelerando)` → carro=1, caminhão=2, ×2 se acelerando.
  - `inserirNoRanking(lista, entrada, max=10)` → ordena desc, corta em 10.
  - `formatarPontos(n)`.
- Testes cobrindo cada regra e os limites (ranking cheio, empate, valor inválido).

### Task 2 — Modelos e cenário (`models.js`)
- `criarMoto()`: carenagem inclinada, rodas, guidão, piloto — silhueta esportiva; inclina ao virar.
- `criarCarro()` / `criarCaminhao()`: caminhão visivelmente maior (cabine + baú).
- `criarCenario(periodo)`: céu, luz e neblina para `dia` (claro, sol) e `noite` (escuro,
  faróis acesos, postes); a pista muda de tom.
- Cores variadas por veículo; sombras simples; nada pesado (roda liso na TV).

### Task 3 — Áudio (`audio.js`)
- `criarMotor()` com `start()`, `setIntensidade(0..1)`, `pausar()`, `retomar()`.
- Frequência/volume ligados à velocidade; corte ao pausar e ao bater.

### Task 4 — Jogo (`game.js` + `index.html`)
- Estados: `aguardando` (QR) → `pronto` (período escolhido) → `jogando` ⇄ `pausado` → `crashed`.
- HUD: pontuação ao vivo, velocidade, indicador de aceleração; fonte e cores de jogo.
- Acelerar: `throttle` aumenta velocidade e o multiplicador de pontos.
- Pontuar ao ultrapassar cada veículo (usa `scoring.js`).
- Tela `crashed`: "Bateu!", pontuação final, se bateu recorde, **ranking top 10** — **sem QR**,
  com botão "Mostrar QR" e "Reiniciar".
- Pausa: congela mundo, escurece a tela, mostra "Pausado".

### Task 5 — Controle (`controle/`)
- Antes de começar: escolha **Dia / Noite** e botão "Começar".
- Durante: **botão grande de acelerar** (segurar), **Pausar/Retomar**, **Reiniciar**, **Calibrar**.
- Feedback de conexão e da pontuação atual (opcional, se vier do jogo).
- Layout de gamepad, paisagem, sem zoom.

### Task 6 — Validação
- `npm test` (JS) e `./gradlew testDebugUnitTest` verdes.
- `assembleDebug` + instalar no emulador; conferir por captura: cena dia e noite, HUD,
  colisão com tela de score/ranking, pausa, QR sob botão.
- Publicar `./publicar.sh 0.3.0` para o banner aparecer na TV.
