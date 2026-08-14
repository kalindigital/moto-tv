# Moto TV — Jogo 3D na Android TV com controle pelo celular

**Data:** 2026-08-14
**Status:** Design aprovado (aguardando revisão do spec antes do plano de implementação)

## Objetivo

Um jogo 3D simples de moto rodando numa **Android TV**, controlado pelo **iPhone** via
acelerômetro. A moto anda para frente sozinha numa pista reta; o jogador inclina o celular
para os lados para desviar dos carros. A TV exibe um **QR code**; o jogador o escaneia,
abre a página do controle no navegador do iPhone e passa a controlar a moto pela rede WiFi
local. Esta primeira versão é um **protótipo jogável enxuto** — foco em provar o controle e
a diversão básica.

## Decisões já tomadas (respostas do brainstorming)

- **Onde o jogo roda:** app **nativo** de Android TV (APK instalável).
- **Stack:** **WebView + Three.js** — o jogo 3D é WebGL/Three.js dentro de um WebView
  empacotado como APK. Escolha alinhada ao domínio do desenvolvedor (JS/TS).
- **Comunicação celular ↔ TV:** **rede WiFi local** (Bluetooth está descartado: o Safari do
  iPhone não suporta Web Bluetooth).
- **Escopo:** protótipo enxuto (anda sozinho, inclina para desviar, bateu = reinicia).
- **Ambiente de teste:** **emulador de Android TV** primeiro, depois hardware real.

## Restrições técnicas que moldam o design

1. **Acelerômetro no iOS exige contexto seguro (HTTPS).** Uma URL `http://192.168.x.x` pura
   NÃO libera os sensores de movimento no Safari. A página do controle precisa ser servida
   por **HTTPS**. Em servidor local isso é resolvido com **certificado autoassinado** — o
   iPhone mostra um aviso "site não seguro" uma única vez; após aceitar, o contexto é seguro
   e os sensores funcionam.
2. **iOS 13+ exige permissão explícita por gesto.** `DeviceMotionEvent.requestPermission()` /
   `DeviceOrientationEvent.requestPermission()` só funcionam a partir de um toque do usuário.
   A página do controle terá um botão "Ativar controle".
3. **Sem internet garantida.** Bibliotecas (Three.js, gerador de QR) ficam locais nos assets
   do APK — nada de CDN.

## Arquitetura

Três peças, todas na rede WiFi local:

```
┌─────────────────────────── Android TV (APK Kotlin) ───────────────────────────┐
│                                                                                │
│   WebView (tela cheia)                    Servidor embutido (Ktor, na TV)      │
│   ┌────────────────────┐                  ┌──────────────────────────────┐     │
│   │  Jogo Three.js     │◄──── ws ────────►│  /            → jogo (TV)     │     │
│   │  (WebGL 3D)        │   (localhost)    │  /controle    → página iPhone │     │
│   │  + QR na tela      │                  │  /ws          → relay         │     │
│   └────────────────────┘                  │  HTTPS c/ cert autoassinado   │     │
│                                           └──────────────┬───────────────┘     │
└──────────────────────────────────────────────────────────┼────────────────────┘
                                                            │ wss (WiFi local)
                                                   ┌────────▼─────────┐
                                                   │  iPhone Safari   │
                                                   │  página /controle│
                                                   │  acelerômetro →  │
                                                   └──────────────────┘
```

- **APK Android TV (Kotlin):** uma única Activity com WebView em fullscreen que carrega o
  jogo. O mesmo app sobe um **servidor Ktor embutido** (HTTP + WebSocket + TLS numa lib só)
  servindo o jogo e a página do controle, com **HTTPS autoassinado**.
- **Jogo (Three.js):** roda no WebView, renderiza a cena 3D e mostra um **QR code** apontando
  para `https://<ip-da-tv>:8443/controle`.
- **iPhone:** escaneia o QR, aceita o certificado (1x), toca em "Ativar controle" e envia a
  inclinação lateral via WebSocket.

**Por que Ktor:** oferece servidor HTTP, WebSocket e TLS na mesma biblioteca Kotlin,
evitando combinar 2–3 libs (ex.: NanoHTTPD + Java-WebSocket + TLS manual).

## Fluxo de dados

1. O app detecta o **IP da TV na WiFi** e gera o QR com `https://<ip>:8443/controle`.
2. iPhone abre a URL → aceita o aviso de certificado (1x) → toca em **"Ativar controle"**
   (gesto obrigatório no iOS para liberar os sensores).
3. A página lê a inclinação lateral e envia mensagens leves e frequentes (~a cada frame,
   ~16 ms) por `wss`: `{ "steer": <-1.0 … 1.0> }`.
4. O servidor Ktor **repassa** a mensagem ao jogo (o WebView está conectado ao `/ws` via
   `localhost`).
5. O jogo aplica `steer` na posição lateral da moto. Colidiu com carro → estado `crashed`.
   Um botão **"Reiniciar"** no celular envia `{ "action": "restart" }` pelo mesmo canal.

**Certificado na TV sem fricção:** o WebView aceita o certificado autoassinado por código
(`onReceivedSslError` → `proceed`), então na TV não há aviso; só o iPhone mostra o aviso uma
vez.

**Modo de teste no emulador:** o iPhone não alcança o servidor dentro do emulador. No modo
dev usa-se `adb forward tcp:8443 tcp:8443` (expõe a porta do emulador no Mac) e o QR aponta
para o **IP do Mac na WiFi**. Na TV real o modo dev fica desligado e o app usa o próprio IP.

## O jogo (Three.js)

- **Pista:** plano reto e comprido; sensação de movimento por rolagem da textura/linhas para
  trás (a moto fica ~fixa no eixo Z; o mundo se move). Duas ou três raias.
- **Moto:** modelo simples (placeholder low-poly, trocável por `.glb` depois). Posição **X**
  (lateral) controlada pelo `steer`; inclina levemente ao virar (feedback visual).
- **Carros:** surgem à frente em raias aleatórias e vêm em direção à câmera. Spawner com
  intervalo fixo (protótipo). Pool de objetos para evitar criar/destruir a cada spawn.
- **Câmera:** 3ª pessoa, atrás e um pouco acima da moto, olhando para frente.
- **Colisão:** caixa (AABB) entre moto e carros. Bateu → estado `crashed`, para o mundo,
  mostra "Bateu! Reinicie no celular".
- **Loop:** `requestAnimationFrame` com `delta` de tempo (independente de FPS).
- **Estados:** `aguardando controle` (mostra QR grande) → `jogando` → `crashed`. Sem celular
  conectado, a tela mostra o QR e instruções.

## O controle no iPhone (página `/controle`)

- Página HTML/JS única, minimalista, **modo paisagem** sugerido (segura como um guidão).
- Botão grande **"Ativar controle"** → `DeviceOrientationEvent.requestPermission()`.
- Leitura da inclinação lateral via **`DeviceOrientationEvent.gamma`** (ângulo, mais estável
  que a aceleração crua), normalizada para `steer ∈ [-1, 1]` com **zona morta** no centro e
  **limite** (ex.: ±35° = máximo). Botão **"Calibrar"** zera a posição neutra na inclinação
  atual.
- Envia por WebSocket com *throttle* (~16 ms) e só quando muda o suficiente, para não floodar.
- Botão **"Reiniciar"** e indicador de conexão (verde/vermelho). Reconecta sozinho se o
  WebSocket cair.

## Estrutura do projeto Android

```
moto-tv/
├── app/
│   ├── src/main/
│   │   ├── java/.../MainActivity.kt       WebView fullscreen + aceita cert local
│   │   ├── java/.../GameServer.kt         Ktor: HTTPS + rotas + WebSocket relay
│   │   ├── java/.../CertFactory.kt        gera/carrega cert autoassinado
│   │   ├── java/.../NetworkUtils.kt       descobre IP na WiFi (ou IP de dev)
│   │   ├── assets/web/
│   │   │   ├── game/  (index.html, game.js, three.min.js, qrcode.js)
│   │   │   └── controle/ (index.html, controle.js)
│   │   └── AndroidManifest.xml            LEANBACK (Android TV) + permissões de rede
│   └── build.gradle.kts
└── settings.gradle.kts
```

- **Android TV:** `AndroidManifest` com `LEANBACK_LAUNCHER`, `uses-feature` de leanback e
  banner na home da TV.
- **Permissões:** `INTERNET` + `ACCESS_NETWORK_STATE` / `ACCESS_WIFI_STATE` (para obter o IP).
- **Assets web:** jogo e controle empacotados no APK (`assets/web`), servidos pelo Ktor.
  Bibliotecas locais (sem CDN).

## Como rodar e testar (emulador primeiro)

1. Abrir no Android Studio; subir um **AVD de Android TV** (API recente).
2. `Run` → app abre no emulador; WebView mostra o jogo + QR.
3. `adb forward tcp:8443 tcp:8443` no Mac.
4. Ligar o **modo dev** no app: o QR aponta para o **IP do Mac na WiFi**
   (`https://<ip-do-mac>:8443/controle`) em vez do IP interno do emulador.
5. iPhone na **mesma WiFi** escaneia → aceita certificado → ativa controle → joga.
6. Na TV real, modo dev desligado; app usa o próprio IP automaticamente.

## Estratégia de testes

- **JS puro (Node/Vitest):** lógica sem render —
  - normalização do `steer` (gamma → [-1, 1], zona morta, clamp);
  - detecção de colisão AABB;
  - parse/serialização das mensagens do WebSocket.
- **Kotlin (JUnit):**
  - relay do Ktor (mensagem entra pelo `/ws` de um cliente e sai para o outro);
  - `NetworkUtils` (formato do IP retornado).
- **Manual (checklist documentado):** render 3D e sensor real do iPhone — não automatizáveis
  de forma confiável.

## Fora de escopo (nesta versão)

- Pontuação/distância, aumento de velocidade, tela de game over elaborada.
- Níveis/fases, obstáculos variados, sons, power-ups.
- Modelos 3D definitivos (usa placeholders low-poly).
- Distribuição/publicação do APK (foco é rodar localmente/emulador).

## Riscos e pontos de atenção

- **Certificado autoassinado no iPhone:** o aviso de segurança pode assustar; documentar o
  passo "visitar mesmo assim". Persistir o mesmo certificado entre execuções evita reaceitar.
- **Rede do emulador:** depende do `adb forward` + IP do Mac; documentar bem no README.
- **Desempenho do WebView na TV real:** manter a cena leve (poucos objetos, pool, materiais
  simples). Validar cedo em hardware.
- **Latência do controle:** WiFi local costuma ser baixa; se houver lag, reduzir frequência e
  suavizar (interpolar) o `steer` no lado do jogo.
```
