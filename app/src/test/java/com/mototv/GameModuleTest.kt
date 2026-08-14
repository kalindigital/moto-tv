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
