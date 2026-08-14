package com.mototv.server

import io.ktor.server.engine.applicationEngineEnvironment
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
        // Em Ktor 2.3.12, sslConnector é uma extensão do ApplicationEngineEnvironmentBuilder,
        // não do bloco `configure` do Netty. Por isso montamos o environment explicitamente.
        // Capturamos em vals locais: dentro do lambda, `config` colidiria com a propriedade
        // `config: ApplicationConfig` do ApplicationEngineEnvironmentBuilder.
        val serverAssets = assets
        val serverConfig = config
        val environment = applicationEngineEnvironment {
            module { gameModule(serverAssets, serverConfig) }
            sslConnector(
                keyStore = keyStore,
                keyAlias = keyAlias,
                keyStorePassword = { keyPassword },
                privateKeyPassword = { keyPassword },
            ) {
                host = "0.0.0.0"
                port = HTTPS_PORT
            }
        }
        engine = embeddedServer(Netty, environment).also { it.start(wait = false) }
    }

    fun stop() {
        engine?.stop(500, 1000)
        engine = null
    }
}
