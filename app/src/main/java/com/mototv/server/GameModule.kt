package com.mototv.server

import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.call
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
