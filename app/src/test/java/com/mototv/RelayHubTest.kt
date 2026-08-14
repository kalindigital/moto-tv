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
