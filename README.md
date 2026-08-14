# Moto TV

Jogo de moto em 3D que roda numa **Android TV** e é controlado por um **iPhone** pela rede WiFi local. A TV mostra o jogo (Three.js) em tela cheia junto com um **QR code**; o celular abre a página de controle no navegador, usa o **acelerômetro/giroscópio** para virar a moto e conversa com a TV por WebSocket. Sem app no celular, sem nuvem: tudo acontece na rede local. Por isso, **qualquer dispositivo na mesma rede WiFi** pode abrir o jogo e enviar comandos de virar/reiniciar — não há autenticação, e isso é intencional para uma rede local de confiança.

## Arquitetura em uma frase

O app Android TV embute um servidor **NanoHTTPD (HTTPS na porta 8444)** que serve o jogo (`/`), a página de controle (`/controle`), a config (`/config`) e um **relay WebSocket** (`/ws`). A WebView da TV carrega o jogo; o iPhone carrega `/controle`; as inclinações do celular chegam à TV pelo `/ws`.

## Pré-requisitos

- **Android Studio** com o **Android SDK** (aqui já está em `~/Library/Android/sdk`).
- Um **AVD de Android TV (API 34)** criado no Device Manager.
- **Node 22** para rodar os testes de JavaScript (Vitest).
- Um **iPhone na MESMA rede WiFi** do Mac (para o fluxo de controle real).
- `local.properties` na raiz com `sdk.dir` apontando para o SDK. Ele é **obrigatório localmente** e está no `.gitignore` (não versionar):

  ```properties
  sdk.dir=/Users/<voce>/Library/Android/sdk
  ```

## Toolchain (atenção — foge do setup ingênuo)

O build roda sob a **JDK 22** já instalada — **não é preciso instalar JDK 17 nem 21**. As versões foram alinhadas para funcionar sob a JDK 22:

- **AGP (Android Gradle Plugin) 8.7.3**
- **Kotlin 2.0.21**
- **Gradle wrapper 8.10.2**

O `build.gradle.kts` do módulo compila para **bytecode Java 17** (`sourceCompatibility`/`targetCompatibility = 17`, `jvmTarget = "17"`), mas isso é apenas o alvo de bytecode — quem executa o Gradle é a JDK 22. `compileSdk`/`targetSdk = 34`, `minSdk = 21`.

## Build

```bash
./gradlew assembleDebug
```

APK gerado em: `app/build/outputs/apk/debug/app-debug.apk`.

## Testes

Duas suítes, ambas devem ficar verdes:

- **JavaScript (Vitest)** — lógica pura do jogo (steering, colisão AABB, protocolo de mensagens):

  ```bash
  npm install   # primeira vez
  npm test
  ```

  Atual: **15 testes** passando (`collision` 4 + `steering` 6 + `protocol` 5).

- **Android (JUnit)** — rotas do servidor, relay, config, certificado e utilidades de rede:

  ```bash
  ./gradlew testDebugUnitTest
  ```

  Atual: **17 testes** passando (`RouteResolverTest` 6 + `NetworkUtilsTest` 4 + `RelayRegistryTest` 3 + `ReadinessTest` 2 + `ServerConfigTest` 1 + `CertFactoryTest` 1).

## Rodar no emulador de Android TV

1. Abra o projeto no Android Studio.
2. No Device Manager, inicie o **AVD de Android TV (API 34)**.
3. Clique em **Run**.

O app sobe o servidor **HTTPS na porta 8444** e a WebView mostra o jogo em tela cheia (landscape) com o **QR code** sobreposto. Só com o teclado você já consegue jogar (ver abaixo).

### Fallback de teclado (sem celular)

- **← / →**: viram a moto. Com o jogo em espera, também iniciam a corrida.
- **Enter**: reinicia após bater.

## Fluxo de desenvolvimento: emulador ↔ iPhone (o pulo do gato)

O iPhone **não alcança** o servidor que está **dentro** do emulador (o AVD tem sua própria rede). Para testar o controle real com o emulador:

1. **`devOverrideIp`** — em `app/src/main/java/com/mototv/MainActivity.kt`, troque
   ```kotlin
   private val devOverrideIp: String? = null
   ```
   pelo **IP do seu Mac na WiFi**, ex.: `"192.168.1.50"`. (No repositório ele fica sempre `null`; edite apenas localmente.)
2. Rebuilde/rode no AVD e, no Mac, exponha a porta do emulador para o host:
   ```bash
   adb forward tcp:8444 tcp:8444
   ```
3. Com isso o QR passa a apontar para `https://<ip-do-mac>:8444/controle`. No iPhone (mesma WiFi):
   - **Escaneie o QR** (ou digite a URL no Safari).
   - **Aceite o certificado autoassinado** uma vez ("Mostrar detalhes" → "Visitar este site"). Esse aviso é **esperado** — o servidor local usa um cert autoassinado.
   - Toque em **Ativar controle** e **permita o movimento**.
   - **Incline** o iPhone para os lados para virar a moto; **Calibrar** ajusta o neutro; **Reiniciar** reinicia após bater.

### Numa Android TV real

Deixe `devOverrideIp = null`. O app descobre sozinho o **IP dele na WiFi** (`NetworkUtils.pickSiteLocalIpv4`) e monta o QR com esse endereço — sem `adb forward`. O iPhone só precisa estar na mesma rede e aceitar o cert autoassinado uma vez.

## Validação manual

O render 3D e o sensor real do celular não são automatizáveis de forma confiável. O passo a passo de conferência manual está em [`docs/CHECKLIST-VALIDACAO.md`](docs/CHECKLIST-VALIDACAO.md).
