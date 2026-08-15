plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

/**
 * Credenciais de assinatura: propriedade do Gradle (~/.gradle/gradle.properties),
 * senão variável de ambiente de mesmo nome, senão o padrão. Nenhuma senha mora
 * neste arquivo — só o caminho e o alias, que não abrem nada sozinhos.
 */
fun assinatura(nome: String, padrao: String): String =
    (project.findProperty(nome) as String?)?.takeIf { it.isNotBlank() }
        ?: System.getenv(nome)?.takeIf { it.isNotBlank() }
        ?: padrao

val keystorePadrao = "${System.getProperty("user.home")}/.android-keystores/moto-tv-release.jks"
val keystore = file(assinatura("MOTOTV_KEYSTORE", keystorePadrao))

android {
    namespace = "com.mototv"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.mototv"
        minSdk = 21
        targetSdk = 34
        versionCode = 5
        versionName = "0.5.0"
    }

    signingConfigs {
        create("release") {
            // Sem o .jks a máquina não assina nada; deixar a config vazia mantém
            // o `assembleDebug` funcionando para quem clonar o repositório.
            if (keystore.exists()) {
                storeFile = keystore
                storePassword = assinatura("MOTOTV_STORE_PASSWORD", "")
                keyAlias = assinatura("MOTOTV_KEY_ALIAS", "mototv")
                keyPassword = assinatura("MOTOTV_KEY_PASSWORD", "")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (keystore.exists()) signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    // BuildConfig.VERSION_NAME é a versão que o app compara com a do GitHub Releases.
    buildFeatures { buildConfig = true }
    packaging {
        resources.excludes += setOf("META-INF/INDEX.LIST", "META-INF/versions/9/OSGI-INF/MANIFEST.MF")
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")

    // NanoHTTPD no lugar do Ktor: Netty quebra por SELinux no Android e CIO não faz HTTPS.
    implementation("org.nanohttpd:nanohttpd:2.3.1")
    implementation("org.nanohttpd:nanohttpd-websocket:2.3.1")

    implementation("org.bouncycastle:bcpkix-jdk18on:1.78.1")

    testImplementation("junit:junit:4.13.2")
    // org.json vem no Android, mas no unit test de JVM as classes são stubs que
    // lançam exceção; esta dependência dá a implementação real para os testes.
    testImplementation("org.json:json:20240303")
}
