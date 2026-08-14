# Moto TV — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um protótipo jogável de jogo 3D de moto rodando num APK de Android TV, controlado pela inclinação de um iPhone via navegador, tudo na rede WiFi local.

**Architecture:** APK Kotlin com uma Activity que roda um WebView em fullscreen. O mesmo app sobe um servidor Ktor embutido (HTTPS autoassinado + WebSocket) que serve o jogo (Three.js) e a página de controle. O iPhone escaneia um QR na TV, abre a página de controle por HTTPS, e envia a inclinação (`gamma`) por WebSocket; o servidor repassa ao jogo, que move a moto.

**Tech Stack:** Kotlin, Android (Gradle/AGP), Ktor (server-core/netty/websockets), Bouncy Castle (cert autoassinado), Three.js (ES module vendorizado), JavaScript ES modules, Vitest (testes JS), JUnit + Ktor test-host (testes Kotlin).

**Spec:** `docs/superpowers/specs/2026-08-14-moto-tv-controle-celular-design.md`

## Global Constraints

- **Porta HTTPS local:** `8443` (usada em todo o projeto).
- **HTTPS obrigatório** para o controle no iOS (cert autoassinado). O WebView da TV aceita o cert por código (`onReceivedSslError` → `proceed`); o iPhone aceita manualmente 1x.
- **iOS:** liberar sensores exige toque do usuário (`DeviceOrientationEvent.requestPermission()`), disponível só em contexto seguro (HTTPS).
- **Sem CDN em runtime:** Three.js e a lib de QR ficam vendorizadas em `app/src/main/assets/web/vendor/`.
- **Protocolo WebSocket (texto/JSON):** `{"t":"steer","v":<-1..1>}` e `{"t":"action","name":"restart"}`.
- **Android TV:** `LEANBACK_LAUNCHER`; `minSdk 21`, `compileSdk 34`, `targetSdk 34`.
- **Mapeamento do controle:** eixo `gamma`; zona morta padrão `3°`; ângulo máximo `35°`; `steer ∈ [-1, 1]`.
- **Versões:** AGP `8.5.2`, Kotlin `1.9.24`, Ktor `2.3.12`, Bouncy Castle `bcpkix-jdk18on:1.78.1`, JDK 17.
- **Módulos JS compartilhados** (importados pelo jogo e pelo controle e testados por Vitest) ficam em `app/src/main/assets/web/shared/`.

---

## File Structure

```
moto-tv/
├── package.json                              Vitest para os módulos JS puros
├── vitest.config.js
├── tests/
│   ├── steering.test.js
│   ├── protocol.test.js
│   └── collision.test.js
├── settings.gradle.kts
├── build.gradle.kts                          config raiz Gradle
├── gradle.properties
├── app/
│   ├── build.gradle.kts
│   └── src/
│       ├── main/
│       │   ├── AndroidManifest.xml
│       │   ├── java/com/mototv/
│       │   │   ├── MainActivity.kt           WebView fullscreen + aceita cert local + start server
│       │   │   ├── server/
│       │   │   │   ├── GameModule.kt          rotas Ktor (assets, /config, /ws) — testável
│       │   │   │   ├── RelayHub.kt            relay WebSocket (broadcast) — testável
│       │   │   │   ├── AssetReader.kt         interface + impl com AssetManager
│       │   │   │   ├── ServerConfig.kt        controllerUrl → JSON
│       │   │   │   └── GameServer.kt          embeddedServer(Netty) + sslConnector
│       │   │   ├── net/NetworkUtils.kt        seleção de IP + URL do controle — testável
│       │   │   └── cert/CertFactory.kt        KeyStore autoassinado (Bouncy Castle) — testável
│       │   └── assets/web/
│       │       ├── shared/
│       │       │   ├── steering.js            gammaToSteer()
│       │       │   ├── protocol.js            serialize/parse mensagens
│       │       │   └── collision.js           aabbOverlap()
│       │       ├── vendor/
│       │       │   ├── three.module.js        (vendorizado, ver Task 8)
│       │       │   └── qrcode.min.js          (vendorizado, ver Task 10)
│       │       ├── game/
│       │       │   ├── index.html
│       │       │   └── game.js
│       │       └── controle/
│       │           ├── index.html
│       │           └── controle.js
│       └── test/java/com/mototv/
│           ├── NetworkUtilsTest.kt
│           ├── CertFactoryTest.kt
│           ├── ServerConfigTest.kt
│           ├── GameModuleTest.kt
│           └── RelayHubTest.kt
└── docs/superpowers/...                       spec + este plano
```

---

## Task 1: Harness JS (Vitest) + lógica de `steer`

**Files:**
- Create: `package.json`, `vitest.config.js`
- Create: `app/src/main/assets/web/shared/steering.js`
- Test: `tests/steering.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `gammaToSteer(gamma: number, opts?: {neutral?, maxAngle?, deadzone?}): number` → `[-1, 1]`.

- [ ] **Step 1: Criar `package.json` e `vitest.config.js`**

`package.json`:
```json
{
  "name": "moto-tv-web-tests",
  "private": true,
  "type": "module",
  "scripts": { "test": "vitest run" },
  "devDependencies": { "vitest": "^2.0.0" }
}
```

`vitest.config.js`:
```js
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node', include: ['tests/**/*.test.js'] } })
```

Rodar: `npm install`

- [ ] **Step 2: Escrever o teste que falha**

`tests/steering.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { gammaToSteer } from '../app/src/main/assets/web/shared/steering.js'

describe('gammaToSteer', () => {
  it('retorna 0 no neutro', () => {
    expect(gammaToSteer(0)).toBe(0)
  })
  it('retorna 0 dentro da zona morta', () => {
    expect(gammaToSteer(2, { deadzone: 3 })).toBe(0)
  })
  it('retorna +1 no ângulo máximo positivo', () => {
    expect(gammaToSteer(35, { maxAngle: 35, deadzone: 3 })).toBeCloseTo(1)
  })
  it('faz clamp acima do máximo', () => {
    expect(gammaToSteer(80, { maxAngle: 35 })).toBeCloseTo(1)
  })
  it('espelha para o lado negativo', () => {
    expect(gammaToSteer(-35, { maxAngle: 35, deadzone: 3 })).toBeCloseTo(-1)
  })
  it('respeita o neutro calibrado', () => {
    expect(gammaToSteer(20, { neutral: 20, deadzone: 3 })).toBe(0)
  })
})
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npm test`
Expected: FAIL — `gammaToSteer is not a function` / módulo não encontrado.

- [ ] **Step 4: Implementar o mínimo**

`app/src/main/assets/web/shared/steering.js`:
```js
export function gammaToSteer(gamma, { neutral = 0, maxAngle = 35, deadzone = 3 } = {}) {
  const delta = gamma - neutral
  const sign = Math.sign(delta)
  const mag = Math.abs(delta)
  if (mag <= deadzone) return 0
  const clamped = Math.min(mag, maxAngle)
  const norm = (clamped - deadzone) / (maxAngle - deadzone)
  return sign * norm
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npm test`
Expected: PASS (6 testes).

- [ ] **Step 6: Commit**

```bash
git add package.json vitest.config.js app/src/main/assets/web/shared/steering.js tests/steering.test.js
git commit -m "feat: gammaToSteer (mapeia inclinacao do celular em steer)"
```

---

## Task 2: Protocolo de mensagens (WebSocket)

**Files:**
- Create: `app/src/main/assets/web/shared/protocol.js`
- Test: `tests/protocol.test.js`

**Interfaces:**
- Produces:
  - `serializeSteer(value: number): string` → `{"t":"steer","v":value}`
  - `serializeAction(name: string): string` → `{"t":"action","name":name}`
  - `parseMessage(str: string): {type:'steer',value:number} | {type:'action',name:string} | {type:'unknown'}`

- [ ] **Step 1: Escrever o teste que falha**

`tests/protocol.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { serializeSteer, serializeAction, parseMessage } from '../app/src/main/assets/web/shared/protocol.js'

describe('protocol', () => {
  it('serializa steer', () => {
    expect(JSON.parse(serializeSteer(0.5))).toEqual({ t: 'steer', v: 0.5 })
  })
  it('serializa action', () => {
    expect(JSON.parse(serializeAction('restart'))).toEqual({ t: 'action', name: 'restart' })
  })
  it('parseia steer e faz clamp em [-1,1]', () => {
    expect(parseMessage('{"t":"steer","v":2}')).toEqual({ type: 'steer', value: 1 })
    expect(parseMessage('{"t":"steer","v":-9}')).toEqual({ type: 'steer', value: -1 })
  })
  it('parseia action', () => {
    expect(parseMessage('{"t":"action","name":"restart"}')).toEqual({ type: 'action', name: 'restart' })
  })
  it('retorna unknown para lixo', () => {
    expect(parseMessage('{"t":"xpto"}')).toEqual({ type: 'unknown' })
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- tests/protocol.test.js`
Expected: FAIL — módulo/funções indefinidas.

- [ ] **Step 3: Implementar**

`app/src/main/assets/web/shared/protocol.js`:
```js
export function serializeSteer(value) {
  return JSON.stringify({ t: 'steer', v: value })
}
export function serializeAction(name) {
  return JSON.stringify({ t: 'action', name })
}
export function parseMessage(str) {
  let m
  try { m = JSON.parse(str) } catch { return { type: 'unknown' } }
  if (m && m.t === 'steer' && typeof m.v === 'number') {
    return { type: 'steer', value: Math.max(-1, Math.min(1, m.v)) }
  }
  if (m && m.t === 'action' && typeof m.name === 'string') {
    return { type: 'action', name: m.name }
  }
  return { type: 'unknown' }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- tests/protocol.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/assets/web/shared/protocol.js tests/protocol.test.js
git commit -m "feat: protocolo de mensagens do controle (serialize/parse)"
```

---

## Task 3: Colisão AABB

**Files:**
- Create: `app/src/main/assets/web/shared/collision.js`
- Test: `tests/collision.test.js`

**Interfaces:**
- Produces: `aabbOverlap(a, b): boolean` onde `a`/`b` são `{x, z, w, d}` (x = lateral, z = profundidade, w/d = largura/comprimento totais).

- [ ] **Step 1: Escrever o teste que falha**

`tests/collision.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { aabbOverlap } from '../app/src/main/assets/web/shared/collision.js'

const box = (x, z) => ({ x, z, w: 2, d: 2 })

describe('aabbOverlap', () => {
  it('detecta sobreposição', () => {
    expect(aabbOverlap(box(0, 0), box(1, 1))).toBe(true)
  })
  it('separado no eixo x → false', () => {
    expect(aabbOverlap(box(0, 0), box(3, 0))).toBe(false)
  })
  it('separado no eixo z → false', () => {
    expect(aabbOverlap(box(0, 0), box(0, 3))).toBe(false)
  })
  it('encostando na borda não conta', () => {
    expect(aabbOverlap(box(0, 0), box(2, 0))).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- tests/collision.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`app/src/main/assets/web/shared/collision.js`:
```js
export function aabbOverlap(a, b) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
         Math.abs(a.z - b.z) < (a.d + b.d) / 2
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS (todos os testes JS verdes).

- [ ] **Step 5: Commit**

```bash
git add app/src/main/assets/web/shared/collision.js tests/collision.test.js
git commit -m "feat: deteccao de colisao AABB"
```

---

## Task 4: Scaffold do projeto Android TV + WebView fullscreen

**Files:**
- Create: `settings.gradle.kts`, `build.gradle.kts`, `gradle.properties`
- Create: `app/build.gradle.kts`
- Create: `app/src/main/AndroidManifest.xml`
- Create: `app/src/main/java/com/mototv/MainActivity.kt`
- Create: `app/src/main/assets/web/game/index.html` (placeholder temporário)

**Interfaces:**
- Consumes: nada.
- Produces: um APK que builda e, ao abrir, mostra um WebView fullscreen carregando `file:///android_asset/web/game/index.html`.

- [ ] **Step 1: Criar os arquivos Gradle**

`settings.gradle.kts`:
```kotlin
pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); mavenCentral() }
}
rootProject.name = "moto-tv"
include(":app")
```

`build.gradle.kts` (raiz):
```kotlin
plugins {
    id("com.android.application") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
}
```

`gradle.properties`:
```properties
org.gradle.jvmargs=-Xmx2048m
android.useAndroidX=true
kotlin.code.style=official
```

`app/build.gradle.kts`:
```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.mototv"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.mototv"
        minSdk = 21
        targetSdk = 34
        versionCode = 1
        versionName = "0.1"
    }
    buildTypes {
        release { isMinifyEnabled = false }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    packaging {
        resources.excludes += setOf("META-INF/INDEX.LIST", "META-INF/io.netty.versions.properties")
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")

    val ktor = "2.3.12"
    implementation("io.ktor:ktor-server-core:$ktor")
    implementation("io.ktor:ktor-server-netty:$ktor")
    implementation("io.ktor:ktor-server-websockets:$ktor")

    implementation("org.bouncycastle:bcpkix-jdk18on:1.78.1")

    testImplementation("junit:junit:4.13.2")
    testImplementation("io.ktor:ktor-server-test-host:$ktor")
    testImplementation("io.ktor:ktor-client-websockets:$ktor")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.1")
}
```

- [ ] **Step 2: Criar o Manifesto (Android TV / LEANBACK)**

`app/src/main/AndroidManifest.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />

    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />
    <uses-feature android:name="android.software.leanback" android:required="true" />

    <application
        android:allowBackup="true"
        android:label="Moto TV"
        android:usesCleartextTraffic="false"
        android:supportsRtl="true">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:screenOrientation="landscape"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:theme="@android:style/Theme.NoTitleBar.Fullscreen">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

- [ ] **Step 3: Criar a MainActivity (WebView placeholder)**

`app/src/main/java/com/mototv/MainActivity.kt`:
```kotlin
package com.mototv

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient

class MainActivity : Activity() {
    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            webViewClient = WebViewClient()
        }
        setContentView(webView)
        webView.loadUrl("file:///android_asset/web/game/index.html")
    }
}
```

- [ ] **Step 4: Criar o placeholder do jogo**

`app/src/main/assets/web/game/index.html`:
```html
<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;background:#111;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">
  <h1>Moto TV — carregando…</h1>
</body>
</html>
```

- [ ] **Step 5: Buildar**

Run: `./gradlew assembleDebug`
Expected: BUILD SUCCESSFUL. (Rodar o wrapper: se não existir, `gradle wrapper --gradle-version 8.7` uma vez.)

- [ ] **Step 6: Smoke manual no emulador**

Subir um AVD de Android TV (API 34) no Android Studio, `Run`. Esperado: tela preta com "Moto TV — carregando…" em fullscreen.

- [ ] **Step 7: Commit**

```bash
git add settings.gradle.kts build.gradle.kts gradle.properties app/build.gradle.kts \
        app/src/main/AndroidManifest.xml app/src/main/java/com/mototv/MainActivity.kt \
        app/src/main/assets/web/game/index.html
git commit -m "feat: scaffold Android TV com WebView fullscreen"
```

---

## Task 5: NetworkUtils (seleção de IP + URL do controle)

**Files:**
- Create: `app/src/main/java/com/mototv/net/NetworkUtils.kt`
- Test: `app/src/test/java/com/mototv/NetworkUtilsTest.kt`

**Interfaces:**
- Produces:
  - `NetworkUtils.isSiteLocalIpv4(ip: String): Boolean`
  - `NetworkUtils.pickSiteLocalIpv4(addrs: List<String>): String?`
  - `NetworkUtils.resolveControllerUrl(ip: String, port: Int, devOverrideIp: String?): String`

- [ ] **Step 1: Escrever o teste que falha**

`app/src/test/java/com/mototv/NetworkUtilsTest.kt`:
```kotlin
package com.mototv

import com.mototv.net.NetworkUtils
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NetworkUtilsTest {
    @Test fun reconhece_ip_local() {
        assertTrue(NetworkUtils.isSiteLocalIpv4("192.168.0.10"))
        assertTrue(NetworkUtils.isSiteLocalIpv4("10.0.0.5"))
        assertTrue(NetworkUtils.isSiteLocalIpv4("172.16.4.4"))
        assertFalse(NetworkUtils.isSiteLocalIpv4("8.8.8.8"))
        assertFalse(NetworkUtils.isSiteLocalIpv4("127.0.0.1"))
    }

    @Test fun escolhe_o_primeiro_ip_local() {
        val addrs = listOf("127.0.0.1", "8.8.8.8", "192.168.1.20")
        assertEquals("192.168.1.20", NetworkUtils.pickSiteLocalIpv4(addrs))
    }

    @Test fun monta_url_do_controle() {
        assertEquals(
            "https://192.168.1.20:8443/controle",
            NetworkUtils.resolveControllerUrl("192.168.1.20", 8443, null)
        )
    }

    @Test fun override_de_dev_tem_prioridade() {
        assertEquals(
            "https://192.168.1.50:8443/controle",
            NetworkUtils.resolveControllerUrl("10.0.2.15", 8443, "192.168.1.50")
        )
    }
}
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `./gradlew testDebugUnitTest --tests com.mototv.NetworkUtilsTest`
Expected: FAIL — não compila / classe ausente.

- [ ] **Step 3: Implementar**

`app/src/main/java/com/mototv/net/NetworkUtils.kt`:
```kotlin
package com.mototv.net

import java.net.NetworkInterface

object NetworkUtils {
    fun isSiteLocalIpv4(ip: String): Boolean {
        val parts = ip.split(".")
        if (parts.size != 4 || parts.any { it.toIntOrNull() == null }) return false
        val (a, b) = parts[0].toInt() to parts[1].toInt()
        return when (a) {
            10 -> true
            192 -> b == 168
            172 -> b in 16..31
            else -> false
        }
    }

    fun pickSiteLocalIpv4(addrs: List<String>): String? =
        addrs.firstOrNull { isSiteLocalIpv4(it) }

    fun resolveControllerUrl(ip: String, port: Int, devOverrideIp: String?): String {
        val host = devOverrideIp?.takeIf { it.isNotBlank() } ?: ip
        return "https://$host:$port/controle"
    }

    /** Uso real no app (não coberto por teste unitário). */
    fun localIpAddresses(): List<String> =
        NetworkInterface.getNetworkInterfaces().toList()
            .flatMap { it.inetAddresses.toList() }
            .filter { !it.isLoopbackAddress && it.address.size == 4 }
            .map { it.hostAddress ?: "" }
            .filter { it.isNotBlank() }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `./gradlew testDebugUnitTest --tests com.mototv.NetworkUtilsTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/com/mototv/net/NetworkUtils.kt app/src/test/java/com/mototv/NetworkUtilsTest.kt
git commit -m "feat: NetworkUtils (IP local + URL do controle)"
```

---

## Task 6: CertFactory (KeyStore autoassinado)

**Files:**
- Create: `app/src/main/java/com/mototv/cert/CertFactory.kt`
- Test: `app/src/test/java/com/mototv/CertFactoryTest.kt`

**Interfaces:**
- Produces: `CertFactory.buildKeyStore(alias: String, password: CharArray, ips: List<String>): java.security.KeyStore` — PKCS12 com uma entrada de chave privada e cert X.509 autoassinado (SAN com `localhost` + os IPs).

- [ ] **Step 1: Escrever o teste que falha**

`app/src/test/java/com/mototv/CertFactoryTest.kt`:
```kotlin
package com.mototv

import com.mototv.cert.CertFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.cert.X509Certificate

class CertFactoryTest {
    @Test fun gera_keystore_autoassinado() {
        val ks = CertFactory.buildKeyStore("moto", "changeit".toCharArray(), listOf("127.0.0.1"))
        assertTrue(ks.isKeyEntry("moto"))
        val cert = ks.getCertificate("moto") as X509Certificate
        // autoassinado: emissor == sujeito
        assertEquals(cert.issuerX500Principal, cert.subjectX500Principal)
        cert.checkValidity() // não lança se estiver dentro da validade
    }
}
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `./gradlew testDebugUnitTest --tests com.mototv.CertFactoryTest`
Expected: FAIL — classe ausente.

- [ ] **Step 3: Implementar**

`app/src/main/java/com/mototv/cert/CertFactory.kt`:
```kotlin
package com.mototv.cert

import org.bouncycastle.asn1.x500.X500Name
import org.bouncycastle.asn1.x509.Extension
import org.bouncycastle.asn1.x509.GeneralName
import org.bouncycastle.asn1.x509.GeneralNames
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder
import org.bouncycastle.jce.provider.BouncyCastleProvider
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder
import java.math.BigInteger
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Security
import java.util.Date

object CertFactory {
    init {
        if (Security.getProvider("BC") == null) Security.addProvider(BouncyCastleProvider())
    }

    fun buildKeyStore(alias: String, password: CharArray, ips: List<String>): KeyStore {
        val kp = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()
        val now = System.currentTimeMillis()
        val notBefore = Date(now - 24L * 60 * 60 * 1000)
        val notAfter = Date(now + 3650L * 24 * 60 * 60 * 1000)
        val subject = X500Name("CN=Moto TV")
        val builder = JcaX509v3CertificateBuilder(
            subject, BigInteger.valueOf(now), notBefore, notAfter, subject, kp.public
        )
        val altNames = mutableListOf(GeneralName(GeneralName.dNSName, "localhost"))
        ips.forEach { altNames.add(GeneralName(GeneralName.iPAddress, it)) }
        builder.addExtension(
            Extension.subjectAlternativeName, false,
            GeneralNames(altNames.toTypedArray())
        )
        val signer = JcaContentSignerBuilder("SHA256WithRSA").build(kp.private)
        val cert = JcaX509CertificateConverter().getCertificate(builder.build(signer))

        return KeyStore.getInstance("PKCS12").apply {
            load(null, null)
            setKeyEntry(alias, kp.private, password, arrayOf(cert))
        }
    }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `./gradlew testDebugUnitTest --tests com.mototv.CertFactoryTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/com/mototv/cert/CertFactory.kt app/src/test/java/com/mototv/CertFactoryTest.kt
git commit -m "feat: CertFactory (cert autoassinado via Bouncy Castle)"
```

---

## Task 7: Ktor — ServerConfig + rota `/config`

**Files:**
- Create: `app/src/main/java/com/mototv/server/ServerConfig.kt`
- Create: `app/src/main/java/com/mototv/server/AssetReader.kt`
- Create: `app/src/main/java/com/mototv/server/GameModule.kt`
- Test: `app/src/test/java/com/mototv/ServerConfigTest.kt`
- Test: `app/src/test/java/com/mototv/GameModuleTest.kt`

**Interfaces:**
- Consumes: nada ainda de rede.
- Produces:
  - `data class ServerConfig(val controllerUrl: String)` + `fun ServerConfig.toJson(): String`
  - `interface AssetReader { fun read(path: String): ByteArray? }`
  - `fun Application.gameModule(assets: AssetReader, config: ServerConfig)` — instala WebSockets + rotas `/config`, `/ws`, e catch-all de assets.

- [ ] **Step 1: Escrever o teste de ServerConfig (falha)**

`app/src/test/java/com/mototv/ServerConfigTest.kt`:
```kotlin
package com.mototv

import com.mototv.server.ServerConfig
import com.mototv.server.toJson
import org.junit.Assert.assertEquals
import org.junit.Test

class ServerConfigTest {
    @Test fun serializa_para_json() {
        val json = ServerConfig("https://192.168.1.20:8443/controle").toJson()
        assertEquals("{\"controllerUrl\":\"https://192.168.1.20:8443/controle\"}", json)
    }
}
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `./gradlew testDebugUnitTest --tests com.mototv.ServerConfigTest`
Expected: FAIL.

- [ ] **Step 3: Implementar ServerConfig e AssetReader**

`app/src/main/java/com/mototv/server/ServerConfig.kt`:
```kotlin
package com.mototv.server

data class ServerConfig(val controllerUrl: String)

fun ServerConfig.toJson(): String =
    "{\"controllerUrl\":\"$controllerUrl\"}"
```

`app/src/main/java/com/mototv/server/AssetReader.kt`:
```kotlin
package com.mototv.server

import android.content.Context

interface AssetReader {
    /** Lê o asset em web/<path>. Retorna null se não existir. */
    fun read(path: String): ByteArray?
}

class AndroidAssetReader(private val context: Context) : AssetReader {
    override fun read(path: String): ByteArray? =
        try {
            context.assets.open("web/$path").use { it.readBytes() }
        } catch (e: Exception) {
            null
        }
}
```

- [ ] **Step 4: Implementar GameModule (rotas `/config`, `/ws`, assets)**

`app/src/main/java/com/mototv/server/GameModule.kt`:
```kotlin
package com.mototv.server

import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import io.ktor.server.websocket.WebSockets
import io.ktor.server.websocket.webSocket

fun Application.gameModule(assets: AssetReader, config: ServerConfig) {
    install(WebSockets)
    val hub = RelayHub()

    routing {
        get("/config") {
            call.respondText(config.toJson(), ContentType.Application.Json)
        }
        webSocket("/ws") {
            hub.join(this)
        }
        get("/{path...}") {
            val parts = call.parameters.getAll("path").orEmpty()
            val rel = when {
                parts.isEmpty() -> "game/index.html"
                parts.size == 1 && parts[0] == "controle" -> "controle/index.html"
                else -> parts.joinToString("/")
            }
            val bytes = assets.read(rel)
            if (bytes == null) call.respond(HttpStatusCode.NotFound)
            else call.respondBytes(bytes, contentTypeFor(rel))
        }
    }
}

fun contentTypeFor(path: String): ContentType = when {
    path.endsWith(".html") -> ContentType.Text.Html
    path.endsWith(".js") -> ContentType.Text.JavaScript
    path.endsWith(".css") -> ContentType.Text.CSS
    path.endsWith(".json") -> ContentType.Application.Json
    path.endsWith(".png") -> ContentType.Image.PNG
    else -> ContentType.Application.OctetStream
}
```

> `RelayHub` é criada na Task 8. Para compilar esta task antes, criar um stub mínimo em `RelayHub.kt`:
> ```kotlin
> package com.mototv.server
> import io.ktor.server.websocket.DefaultWebSocketServerSession
> class RelayHub { suspend fun join(session: DefaultWebSocketServerSession) {} }
> ```
> A Task 8 substitui o corpo do `join` e adiciona o teste do relay.

- [ ] **Step 5: Escrever o teste do GameModule (rota /config + assets)**

`app/src/test/java/com/mototv/GameModuleTest.kt`:
```kotlin
package com.mototv

import com.mototv.server.AssetReader
import com.mototv.server.ServerConfig
import com.mototv.server.gameModule
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class FakeAssets(private val files: Map<String, String>) : AssetReader {
    override fun read(path: String): ByteArray? = files[path]?.toByteArray()
}

class GameModuleTest {
    @Test fun config_retorna_url_do_controle() = testApplication {
        application {
            gameModule(FakeAssets(emptyMap()), ServerConfig("https://x:8443/controle"))
        }
        val resp = client.get("/config")
        assertEquals(HttpStatusCode.OK, resp.status)
        assertEquals("{\"controllerUrl\":\"https://x:8443/controle\"}", resp.bodyAsText())
    }

    @Test fun raiz_serve_o_index_do_jogo() = testApplication {
        application {
            gameModule(FakeAssets(mapOf("game/index.html" to "<h1>JOGO</h1>")), ServerConfig("u"))
        }
        val resp = client.get("/")
        assertEquals("<h1>JOGO</h1>", resp.bodyAsText())
    }

    @Test fun path_controle_serve_o_index_do_controle() = testApplication {
        application {
            gameModule(FakeAssets(mapOf("controle/index.html" to "<h1>CTRL</h1>")), ServerConfig("u"))
        }
        val resp = client.get("/controle")
        assertEquals("<h1>CTRL</h1>", resp.bodyAsText())
    }

    @Test fun asset_inexistente_da_404() = testApplication {
        application { gameModule(FakeAssets(emptyMap()), ServerConfig("u")) }
        assertEquals(HttpStatusCode.NotFound, client.get("/game/nao-existe.js").status)
    }
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `./gradlew testDebugUnitTest --tests com.mototv.GameModuleTest --tests com.mototv.ServerConfigTest`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/src/main/java/com/mototv/server/ app/src/test/java/com/mototv/GameModuleTest.kt \
        app/src/test/java/com/mototv/ServerConfigTest.kt
git commit -m "feat: rotas Ktor (config + assets) e ServerConfig"
```

---

## Task 8: RelayHub (broadcast WebSocket)

**Files:**
- Modify: `app/src/main/java/com/mototv/server/RelayHub.kt`
- Test: `app/src/test/java/com/mototv/RelayHubTest.kt`

**Interfaces:**
- Consumes: sessões WebSocket do Ktor.
- Produces: `RelayHub.join(session)` que registra a sessão e reenvia cada `Frame.Text` recebido para todas as OUTRAS sessões conectadas.

- [ ] **Step 1: Escrever o teste do relay (falha)**

`app/src/test/java/com/mototv/RelayHubTest.kt`:
```kotlin
package com.mototv

import com.mototv.server.ServerConfig
import com.mototv.server.gameModule
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import io.ktor.server.testing.testApplication
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Test

class RelayHubTest {
    @Test fun repassa_mensagem_de_um_cliente_para_o_outro() = testApplication {
        application { gameModule(FakeAssets(emptyMap()), ServerConfig("u")) }
        val client = createClient { install(WebSockets) }

        client.webSocket("/ws") { // receptor (ex.: o jogo)
            val recebido = withTimeout(5000) {
                // dá tempo do receptor entrar no hub antes do emissor mandar
                launch {
                    client.webSocket("/ws") { // emissor (ex.: o celular)
                        send(Frame.Text("{\"t\":\"steer\",\"v\":0.5}"))
                    }
                }
                (incoming.receive() as Frame.Text).readText()
            }
            assertEquals("{\"t\":\"steer\",\"v\":0.5}", recebido)
        }
    }
}
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `./gradlew testDebugUnitTest --tests com.mototv.RelayHubTest`
Expected: FAIL — o stub não repassa nada (timeout).

- [ ] **Step 3: Implementar o RelayHub**

`app/src/main/java/com/mototv/server/RelayHub.kt`:
```kotlin
package com.mototv.server

import io.ktor.server.websocket.DefaultWebSocketServerSession
import io.ktor.websocket.Frame
import io.ktor.websocket.WebSocketSession
import io.ktor.websocket.readText
import java.util.Collections

class RelayHub {
    private val sessions: MutableSet<WebSocketSession> =
        Collections.synchronizedSet(LinkedHashSet())

    suspend fun join(session: DefaultWebSocketServerSession) {
        sessions.add(session)
        try {
            for (frame in session.incoming) {
                if (frame is Frame.Text) broadcast(frame.readText(), session)
            }
        } finally {
            sessions.remove(session)
        }
    }

    private suspend fun broadcast(text: String, from: WebSocketSession) {
        val targets = synchronized(sessions) { sessions.filter { it !== from } }
        targets.forEach { it.send(Frame.Text(text)) }
    }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `./gradlew testDebugUnitTest --tests com.mototv.RelayHubTest`
Expected: PASS. (Se houver flakiness de timing, o `withTimeout(5000)` cobre a folga.)

- [ ] **Step 5: Rodar toda a suíte Kotlin**

Run: `./gradlew testDebugUnitTest`
Expected: PASS (NetworkUtils, CertFactory, ServerConfig, GameModule, RelayHub).

- [ ] **Step 6: Commit**

```bash
git add app/src/main/java/com/mototv/server/RelayHub.kt app/src/test/java/com/mototv/RelayHubTest.kt
git commit -m "feat: RelayHub repassa mensagens entre celular e jogo"
```

---

## Task 9: GameServer (Netty + HTTPS) e integração na MainActivity

**Files:**
- Create: `app/src/main/java/com/mototv/server/GameServer.kt`
- Modify: `app/src/main/java/com/mototv/MainActivity.kt`

**Interfaces:**
- Consumes: `CertFactory`, `NetworkUtils`, `AndroidAssetReader`, `gameModule`, `ServerConfig`.
- Produces: `class GameServer(assets, config, keyStore, keyAlias, keyPassword)` com `start()` / `stop()`, ouvindo HTTPS em `0.0.0.0:8443`.

- [ ] **Step 1: Implementar GameServer**

`app/src/main/java/com/mototv/server/GameServer.kt`:
```kotlin
package com.mototv.server

import io.ktor.server.engine.embeddedServer
import io.ktor.server.engine.sslConnector
import io.ktor.server.netty.Netty
import io.ktor.server.netty.NettyApplicationEngine
import java.security.KeyStore

const val HTTPS_PORT = 8443

class GameServer(
    private val assets: AssetReader,
    private val config: ServerConfig,
    private val keyStore: KeyStore,
    private val keyAlias: String,
    private val keyPassword: CharArray,
) {
    private var engine: NettyApplicationEngine? = null

    fun start() {
        engine = embeddedServer(Netty, configure = {
            sslConnector(
                keyStore = keyStore,
                keyAlias = keyAlias,
                keyStorePassword = { keyPassword },
                privateKeyPassword = { keyPassword },
            ) {
                host = "0.0.0.0"
                port = HTTPS_PORT
            }
        }) {
            gameModule(assets, config)
        }.also { it.start(wait = false) }
    }

    fun stop() {
        engine?.stop(500, 1000)
        engine = null
    }
}
```

- [ ] **Step 2: Integrar na MainActivity**

Substituir `app/src/main/java/com/mototv/MainActivity.kt`:
```kotlin
package com.mototv

import android.annotation.SuppressLint
import android.app.Activity
import android.net.http.SslError
import android.os.Bundle
import android.webkit.SslErrorHandler
import android.webkit.WebView
import android.webkit.WebViewClient
import com.mototv.cert.CertFactory
import com.mototv.net.NetworkUtils
import com.mototv.server.AndroidAssetReader
import com.mototv.server.GameServer
import com.mototv.server.HTTPS_PORT
import com.mototv.server.ServerConfig

class MainActivity : Activity() {

    // Para testar no emulador: coloque aqui o IP do seu Mac na WiFi e rode
    // `adb forward tcp:8443 tcp:8443`. Na TV real, deixe null.
    private val devOverrideIp: String? = null

    private lateinit var webView: WebView
    private var server: GameServer? = null
    private val keyPass = "changeit".toCharArray()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val ip = NetworkUtils.pickSiteLocalIpv4(NetworkUtils.localIpAddresses()) ?: "127.0.0.1"
        val controllerUrl = NetworkUtils.resolveControllerUrl(ip, HTTPS_PORT, devOverrideIp)
        val keyStore = CertFactory.buildKeyStore("moto", keyPass, listOf(ip, "127.0.0.1"))

        server = GameServer(
            assets = AndroidAssetReader(this),
            config = ServerConfig(controllerUrl),
            keyStore = keyStore,
            keyAlias = "moto",
            keyPassword = keyPass,
        ).also { it.start() }

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            webViewClient = object : WebViewClient() {
                // Aceita o cert autoassinado do PRÓPRIO servidor local (protótipo).
                override fun onReceivedSslError(v: WebView?, h: SslErrorHandler?, e: SslError?) {
                    h?.proceed()
                }
            }
        }
        setContentView(webView)
        webView.loadUrl("https://127.0.0.1:$HTTPS_PORT/")
    }

    override fun onDestroy() {
        server?.stop()
        super.onDestroy()
    }
}
```

- [ ] **Step 3: Build**

Run: `./gradlew assembleDebug`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Smoke manual no emulador**

`Run` no AVD de Android TV. Esperado: o WebView carrega `https://127.0.0.1:8443/` (o placeholder "carregando…"), servido pelo Ktor por HTTPS, sem erro de cert (aceito por código). Se aparecer tela em branco, ver Logcat por exceções do Netty.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/com/mototv/server/GameServer.kt app/src/main/java/com/mototv/MainActivity.kt
git commit -m "feat: servidor Netty HTTPS embutido servindo o WebView"
```

---

## Task 10: Página de controle do iPhone (`/controle`)

**Files:**
- Create: `app/src/main/assets/web/controle/index.html`
- Create: `app/src/main/assets/web/controle/controle.js`

**Interfaces:**
- Consumes: `shared/steering.js` (`gammaToSteer`), `shared/protocol.js` (`serializeSteer`, `serializeAction`).
- Produces: página que pede permissão de movimento, lê `gamma`, calibra o neutro, envia `steer` e `restart` por `wss://<host>/ws`, mostra status de conexão e reconecta.

- [ ] **Step 1: Criar o HTML**

`app/src/main/assets/web/controle/index.html`:
```html
<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <title>Controle — Moto TV</title>
  <style>
    html,body{margin:0;height:100%;background:#0b0b12;color:#fff;font-family:system-ui,sans-serif;
      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;overflow:hidden}
    button{font-size:20px;padding:16px 28px;border:0;border-radius:14px;background:#6E29F6;color:#fff}
    button:active{filter:brightness(.85)}
    #status{position:fixed;top:10px;right:14px;font-size:14px}
    .dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#e33;margin-right:6px}
    .dot.on{background:#3c3}
    #bar{width:70vw;height:16px;background:#222;border-radius:8px;overflow:hidden}
    #fill{height:100%;width:50%;background:#6E29F6;transition:width .05s linear}
    .row{display:flex;gap:14px}
  </style>
</head>
<body>
  <div id="status"><span class="dot" id="dot"></span><span id="conn">desconectado</span></div>
  <button id="start">Ativar controle</button>
  <div id="bar"><div id="fill"></div></div>
  <div class="row">
    <button id="calib">Calibrar</button>
    <button id="restart">Reiniciar</button>
  </div>
  <script type="module" src="./controle.js"></script>
</body>
</html>
```

- [ ] **Step 2: Criar o controle.js**

`app/src/main/assets/web/controle/controle.js`:
```js
import { gammaToSteer } from '../shared/steering.js'
import { serializeSteer, serializeAction } from '../shared/protocol.js'

const wsUrl = `wss://${location.host}/ws`
let ws
let neutral = 0
let lastSent = 0
let lastValue = 999

const dot = document.getElementById('dot')
const conn = document.getElementById('conn')
const fill = document.getElementById('fill')

function connect() {
  ws = new WebSocket(wsUrl)
  ws.onopen = () => { dot.classList.add('on'); conn.textContent = 'conectado' }
  ws.onclose = () => { dot.classList.remove('on'); conn.textContent = 'reconectando…'; setTimeout(connect, 1000) }
  ws.onerror = () => ws.close()
}

function onOrientation(e) {
  const gamma = e.gamma ?? 0
  const steer = gammaToSteer(gamma, { neutral, maxAngle: 35, deadzone: 3 })
  fill.style.width = `${(steer + 1) * 50}%`
  const now = performance.now()
  if (now - lastSent > 16 && Math.abs(steer - lastValue) > 0.01) {
    lastSent = now
    lastValue = steer
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(serializeSteer(steer))
  }
}

document.getElementById('start').addEventListener('click', async () => {
  // iOS exige permissão explícita a partir de um gesto
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const res = await DeviceOrientationEvent.requestPermission()
      if (res !== 'granted') { alert('Permissão de movimento negada'); return }
    } catch { alert('Erro ao pedir permissão'); return }
  }
  window.addEventListener('deviceorientation', onOrientation)
  document.getElementById('start').style.display = 'none'
})

document.getElementById('calib').addEventListener('click', () => {
  // usa a leitura atual como novo neutro
  window.addEventListener('deviceorientation', function once(e) {
    neutral = e.gamma ?? 0
    window.removeEventListener('deviceorientation', once)
  }, { once: true })
})

document.getElementById('restart').addEventListener('click', () => {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(serializeAction('restart'))
})

connect()
```

- [ ] **Step 3: Build**

Run: `./gradlew assembleDebug`
Expected: BUILD SUCCESSFUL (assets empacotados).

- [ ] **Step 4: Verificação manual (adiada para o E2E da Task 12)**

Sem iPhone conectado ainda não dá para validar o sensor. Confirmar apenas que `https://127.0.0.1:8443/controle` responde o HTML (abrir no navegador do próprio host via `adb forward`, se quiser um smoke rápido).

- [ ] **Step 5: Commit**

```bash
git add app/src/main/assets/web/controle/
git commit -m "feat: pagina de controle do iPhone (permissao, gamma, ws)"
```

---

## Task 11: Jogo Three.js (cena, moto, carros, câmera, colisão)

**Files:**
- Create: `app/src/main/assets/web/vendor/three.module.js` (vendorizado)
- Create: `app/src/main/assets/web/vendor/qrcode.min.js` (vendorizado)
- Modify: `app/src/main/assets/web/game/index.html`
- Create: `app/src/main/assets/web/game/game.js`

**Interfaces:**
- Consumes: `shared/collision.js` (`aabbOverlap`), `shared/protocol.js` (`parseMessage`), `three.module.js`, `qrcode.min.js` (global `QRCode`), endpoint `/config`, WebSocket `/ws`.
- Produces: o jogo renderizado com estados `aguardando`/`jogando`/`crashed`, dirigido por `steer` (WebSocket) e por teclado (fallback de dev).

- [ ] **Step 1: Vendorizar as libs**

Baixar (uma vez, em dev — não é CDN em runtime):
- Three.js r160+ ESM → salvar como `app/src/main/assets/web/vendor/three.module.js`
  (do pacote `three` em `build/three.module.js`).
- QRCode (davidshimjs/qrcodejs `qrcode.min.js`, expõe global `QRCode`) → `app/src/main/assets/web/vendor/qrcode.min.js`.

Verificação: os dois arquivos existem e não estão vazios (`wc -c`).

- [ ] **Step 2: Reescrever o index.html do jogo**

`app/src/main/assets/web/game/index.html`:
```html
<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Moto TV</title>
  <style>
    html,body{margin:0;height:100%;overflow:hidden;background:#000;font-family:system-ui,sans-serif;color:#fff}
    #overlay{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
      gap:16px;background:rgba(0,0,0,.7);text-align:center}
    #overlay.hidden{display:none}
    #qr{background:#fff;padding:12px;border-radius:10px}
    h2{margin:0}
  </style>
</head>
<body>
  <div id="overlay">
    <h2 id="msg">Aponte o celular para o QR e toque em "Ativar controle"</h2>
    <div id="qr"></div>
  </div>
  <script src="../vendor/qrcode.min.js"></script>
  <script type="module" src="./game.js"></script>
</body>
</html>
```

- [ ] **Step 3: Escrever o game.js**

`app/src/main/assets/web/game/game.js`:
```js
import * as THREE from '../vendor/three.module.js'
import { aabbOverlap } from '../shared/collision.js'
import { parseMessage } from '../shared/protocol.js'

const LANES = [-2.2, 0, 2.2]
const MOTO = { w: 1.0, d: 2.0 }
const CAR = { w: 1.4, d: 2.4 }

let state = 'aguardando'   // aguardando | jogando | crashed
let steer = 0              // -1..1 (WebSocket ou teclado)
let targetX = 0
let speed = 22             // unidades/seg do "mundo" andando

// ---- Three.js setup ----
const scene = new THREE.Scene()
scene.fog = new THREE.Fog(0x0b0b12, 30, 90)
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 200)
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(innerWidth, innerHeight)
document.body.appendChild(renderer.domElement)
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.1))

// pista
const road = new THREE.Mesh(
  new THREE.PlaneGeometry(9, 400),
  new THREE.MeshStandardMaterial({ color: 0x1a1a22 })
)
road.rotation.x = -Math.PI / 2
road.position.z = -180
scene.add(road)

// faixas (marcadores que "andam" para trás para dar sensação de velocidade)
const stripes = []
for (let i = 0; i < 40; i++) {
  const s = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.02, 2),
    new THREE.MeshStandardMaterial({ color: 0x666677 })
  )
  s.position.set(0, 0.02, -i * 8)
  scene.add(s); stripes.push(s)
}

// moto (placeholder)
const moto = new THREE.Mesh(
  new THREE.BoxGeometry(MOTO.w, 1, MOTO.d),
  new THREE.MeshStandardMaterial({ color: 0x6E29F6 })
)
moto.position.set(0, 0.5, 0)
scene.add(moto)

// carros (pool)
const cars = []
for (let i = 0; i < 6; i++) {
  const c = new THREE.Mesh(
    new THREE.BoxGeometry(CAR.w, 1.2, CAR.d),
    new THREE.MeshStandardMaterial({ color: 0xdd3333 })
  )
  c.visible = false
  c.userData.active = false
  scene.add(c); cars.push(c)
}
let spawnTimer = 0

function spawnCar() {
  const c = cars.find((x) => !x.userData.active)
  if (!c) return
  c.userData.active = true
  c.visible = true
  c.position.set(LANES[(Math.random() * LANES.length) | 0], 0.6, -80)
}

function resetGame() {
  cars.forEach((c) => { c.userData.active = false; c.visible = false })
  moto.position.x = 0; targetX = 0; steer = 0
  spawnTimer = 0
  state = 'jogando'
  setOverlay(false)
}

function setOverlay(show, msg) {
  const o = document.getElementById('overlay')
  o.classList.toggle('hidden', !show)
  if (msg) document.getElementById('msg').textContent = msg
}

// ---- config + QR ----
fetch('/config').then((r) => r.json()).then((cfg) => {
  // eslint-disable-next-line no-new
  new QRCode(document.getElementById('qr'), { text: cfg.controllerUrl, width: 220, height: 220 })
})

// ---- WebSocket (recebe steer/restart do celular) ----
function connectWs() {
  const ws = new WebSocket(`wss://${location.host}/ws`)
  ws.onmessage = (ev) => {
    const m = parseMessage(ev.data)
    if (m.type === 'steer') {
      steer = m.value
      if (state === 'aguardando') resetGame()
    } else if (m.type === 'action' && m.name === 'restart') {
      resetGame()
    }
  }
  ws.onclose = () => setTimeout(connectWs, 1000)
  ws.onerror = () => ws.close()
}
connectWs()

// ---- fallback de teclado (dev, sem celular) ----
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') { steer = -1; if (state === 'aguardando') resetGame() }
  if (e.key === 'ArrowRight') { steer = 1; if (state === 'aguardando') resetGame() }
  if (e.key === 'Enter' && state === 'crashed') resetGame()
})
addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') steer = 0
})

// ---- loop ----
let last = performance.now()
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05)
  last = now

  if (state === 'jogando') {
    // move a moto lateralmente
    targetX = Math.max(-3.2, Math.min(3.2, targetX + steer * dt * 6))
    moto.position.x += (targetX - moto.position.x) * 0.2
    moto.rotation.z = -steer * 0.3

    // "mundo" andando: faixas e carros vêm em direção à câmera
    for (const s of stripes) {
      s.position.z += speed * dt
      if (s.position.z > 5) s.position.z -= 40 * 8 / 40 * 40 === 0 ? 0 : 320, s.position.z -= 0 // ver ajuste abaixo
    }
    // recicla faixas de forma simples
    stripes.forEach((s) => { if (s.position.z > 6) s.position.z -= 320 })

    spawnTimer += dt
    if (spawnTimer > 0.9) { spawnTimer = 0; spawnCar() }

    for (const c of cars) {
      if (!c.userData.active) continue
      c.position.z += speed * dt
      if (c.position.z > 6) { c.userData.active = false; c.visible = false; continue }
      const hit = aabbOverlap(
        { x: moto.position.x, z: moto.position.z, w: MOTO.w, d: MOTO.d },
        { x: c.position.x, z: c.position.z, w: CAR.w, d: CAR.d }
      )
      if (hit) { state = 'crashed'; setOverlay(true, 'Bateu! Reinicie no celular (ou Enter)') }
    }
  }

  // câmera em 3ª pessoa
  camera.position.set(moto.position.x * 0.5, 4, moto.position.z + 8)
  camera.lookAt(moto.position.x * 0.3, 1, moto.position.z - 10)

  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
```

> **Nota de revisão para o executor:** a linha de reciclagem de faixas acima tem
> um trecho propositalmente redundante herdado de rascunho — mantenha apenas
> `stripes.forEach((s) => { if (s.position.z > 6) s.position.z -= 320 })` dentro
> do bloco `if (state === 'jogando')` e remova o `if (s.position.z > 5) …` de
> dentro do primeiro `for`. O objetivo é só: somar `speed*dt` em cada faixa e,
> quando passar da câmera, jogá-la de volta para o fundo (`-320`).

- [ ] **Step 4: Build + smoke no emulador (teclado)**

Run: `./gradlew assembleDebug` → `Run` no AVD.
Esperado: aparece o QR na overlay; ao apertar ← / → (D-pad/teclado do emulador), o jogo começa, a moto anda, carros surgem e vêm em direção à câmera; bater mostra "Bateu!".

- [ ] **Step 5: Commit**

```bash
git add app/src/main/assets/web/vendor/ app/src/main/assets/web/game/
git commit -m "feat: jogo Three.js (pista, moto, carros, camera, colisao, QR)"
```

---

## Task 12: Validação E2E no emulador com o iPhone + docs

**Files:**
- Create: `README.md`
- Create: `docs/CHECKLIST-VALIDACAO.md`

**Interfaces:**
- Consumes: app completo das tasks anteriores.
- Produces: passo a passo reproduzível de teste e checklist manual.

- [ ] **Step 1: Preparar o modo dev**

Editar `MainActivity.kt`: setar `devOverrideIp` para o IP do Mac na WiFi (ex.: `"192.168.1.50"`). Rebuildar e rodar no AVD. No Mac: `adb forward tcp:8443 tcp:8443`.

- [ ] **Step 2: Rodar o E2E manual**

1. AVD aberto mostra o jogo + QR (QR aponta para `https://192.168.1.50:8443/controle`).
2. iPhone XR na **mesma WiFi** → escanear o QR (ou digitar a URL no Safari).
3. Aceitar o aviso de certificado ("Mostrar detalhes" → "Visitar este site").
4. Tocar em **Ativar controle** → permitir movimento.
5. Inclinar o iPhone para os lados → a moto desvia; **Calibrar** ajusta o neutro; **Reiniciar** reinicia após bater.

Esperado: latência baixa, moto responde à inclinação, colisão reinicia pelo botão.

- [ ] **Step 3: Escrever o README**

`README.md` com: pré-requisitos (Android Studio, JDK 17, AVD Android TV, iPhone na mesma WiFi), como buildar (`./gradlew assembleDebug`), como rodar testes (`npm test` e `./gradlew testDebugUnitTest`), o passo do `adb forward` + `devOverrideIp` para emulador, e a observação de que na TV real `devOverrideIp = null`.

- [ ] **Step 4: Escrever o checklist de validação manual**

`docs/CHECKLIST-VALIDACAO.md` com os itens do Step 2 em formato de checkbox, mais: render 3D fluido, QR legível na TV, reconexão do WebSocket ao bloquear/desbloquear o iPhone, e comportamento ao girar o iPhone (paisagem).

- [ ] **Step 5: Marcar tarefas no TAREFAS.md e commit**

Atualizar `TAREFAS.md` (marcar itens concluídos).

```bash
git add README.md docs/CHECKLIST-VALIDACAO.md TAREFAS.md
git commit -m "docs: README, checklist de validacao e status das tarefas"
```

---

## Self-Review (feita ao escrever o plano)

- **Cobertura do spec:** arquitetura (Tasks 4/7/8/9), fluxo de dados/relay (Tasks 7/8/9/11/12), jogo Three.js (Task 11), controle iPhone (Task 10), permissão/gamma/deadzone/±35° (Tasks 1/10), QR (Task 11), cert autoassinado (Tasks 6/9), IP + modo dev/emulador (Tasks 5/9/12), testes JS+Kotlin (Tasks 1–3, 5–8), fora de escopo respeitado (protótipo). ✔
- **Placeholders:** o único "placeholder" real é o `three.module.js`/`qrcode.min.js` a vendorizar (Task 11, Step 1) — é download de dependência, com instrução explícita, não código a inventar. O trecho redundante do `game.js` está sinalizado com instrução de limpeza. ✔
- **Consistência de tipos/nomes:** `gammaToSteer`, `serializeSteer/serializeAction/parseMessage`, `aabbOverlap({x,z,w,d})`, `AssetReader.read`, `gameModule(assets, config)`, `ServerConfig.controllerUrl`, `RelayHub.join`, `GameServer(assets, config, keyStore, keyAlias, keyPassword)`, porta `8443`/`HTTPS_PORT` — usados de forma consistente entre tasks. ✔

> Observação: as Tasks 10/11 têm entrega verificável **manual** (render 3D e sensor real não são automatizáveis de forma confiável). A lógica pura por trás delas (`steer`, colisão, protocolo) está coberta por testes nas Tasks 1–3.
