# Moto TV

Jogo de moto em 3D que roda numa **Android TV** e é controlado por um **iPhone** pela rede WiFi local. A TV mostra o jogo (Three.js) em tela cheia junto com um **QR code**; o celular abre a página de controle no navegador, usa o **acelerômetro/giroscópio** para virar a moto e conversa com a TV por WebSocket. Sem app no celular, sem nuvem: tudo acontece na rede local. Por isso, **qualquer dispositivo na mesma rede WiFi** pode abrir o jogo e enviar comandos de virar/reiniciar — não há autenticação, e isso é intencional para uma rede local de confiança.

## Arquitetura em uma frase

O app Android TV embute um servidor **NanoHTTPD (HTTPS na porta 8444)** que serve o jogo (`/`), a página de controle (`/controle`), a config (`/config`), o estado da atualização (`/update`) e um **relay WebSocket** (`/ws`). A WebView da TV carrega o jogo; o iPhone carrega `/controle`; as inclinações do celular chegam à TV pelo `/ws`.

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

  Atual: **33 testes** passando (`GithubUpdatesTest` 12 + `RouteResolverTest` 7 + `NetworkUtilsTest` 4 + `RelayRegistryTest` 3 + `UpdateStatusTest` 3 + `ReadinessTest` 2 + `ServerConfigTest` 1 + `CertFactoryTest` 1).

## Rodar no emulador de Android TV

1. Abra o projeto no Android Studio.
2. No Device Manager, inicie o **AVD de Android TV (API 34)**.
3. Clique em **Run**.

O app sobe o servidor **HTTPS na porta 8444** e a WebView mostra o jogo em tela cheia (landscape) com o **QR code** sobreposto. Só com o teclado você já consegue jogar (ver abaixo).

### Fallback de teclado (sem celular)

- **← / →**: viram a moto. Com o jogo em espera, também iniciam a corrida.
- **Enter** (o **OK** do controle da TV): confirma a atualização quando o banner está na tela; fora disso, reinicia após bater.

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

## Atualização automática (GitHub Releases)

Ao abrir, o app consulta `https://api.github.com/repos/kalindigital/moto-tv/releases/latest` numa thread de fundo e compara a tag (`v0.2.0` → `0.2.0`) com o `versionName` instalado, **número a número** — `1.10.0` é mais novo que `1.9.0`, o que a ordem alfabética erraria. Havendo versão nova com um `.apk` anexado, o resultado fica no `UpdateHolder` e a rota `GET /update` passa a devolver:

```json
{"disponivel":true,"versao":"0.2.0","changelog":"- ..."}
```

O jogo consulta essa rota ao carregar (e repete a cada 5 s, até 6 vezes, porque a checagem de rede pode terminar depois da página) e mostra uma **faixa roxa no topo**: *"Nova versão 0.2.0 disponível — pressione OK para atualizar"*. O **OK/Enter** chama `window.MotoTV.baixarAtualizacao()` (ponte `@JavascriptInterface` da `MainActivity`); o download roda em thread de fundo e devolve o progresso à faixa por `window.__updateProgress(pct)`. Terminado, o app abre o instalador do sistema via `FileProvider` (autoridade `com.mototv.updates`). **O jogo continua jogável o tempo todo** — as setas nunca são desviadas para o banner.

## Publicar uma versão

A assinatura fica **fora do repositório**. O `app/build.gradle.kts` lê, nesta ordem: propriedade do Gradle → variável de ambiente → padrão.

| Propriedade | Padrão |
| --- | --- |
| `MOTOTV_KEYSTORE` | `~/.android-keystores/moto-tv-release.jks` |
| `MOTOTV_KEY_ALIAS` | `mototv` |
| `MOTOTV_STORE_PASSWORD` | — (obrigatória) |
| `MOTOTV_KEY_PASSWORD` | — (obrigatória) |

As **senhas moram em `~/.gradle/gradle.properties`** (arquivo do usuário, nunca do projeto). Se o `.jks` não existir na máquina, o `signingConfig` nem é montado — `assembleDebug` continua funcionando para quem clonar o repositório.

```bash
./publicar.sh 0.2.0 "- Banner de atualização no jogo"
```

O script sobe o `versionCode` (+1) e o `versionName`, roda os testes, compila o APK **assinado**, commita, cria a tag `v0.2.0`, dá push e publica o release no GitHub com dois anexos: `moto-tv-0.2.0.apk` (histórico) e `moto-tv.apk` (URL fixa). O APK **nunca** é versionado (está no `.gitignore`).

## Validação manual

O render 3D e o sensor real do celular não são automatizáveis de forma confiável. O passo a passo de conferência manual está em [`docs/CHECKLIST-VALIDACAO.md`](docs/CHECKLIST-VALIDACAO.md).
