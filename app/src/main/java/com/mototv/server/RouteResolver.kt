package com.mototv.server

/**
 * Resultado do roteamento de um path HTTP. Puro de propósito: sem tipos de
 * Android nem do motor HTTP, para ser testável em JVM pura.
 */
sealed class Route {
    /** GET /config -> JSON com a URL do controle. */
    object Config : Route()

    /** GET /update -> JSON com a atualização disponível (ou a ausência dela). */
    object Update : Route()

    /** WS /ws -> relay entre celular e jogo. */
    object Ws : Route()

    /** Asset estático em web/<relPath>. */
    data class Asset(val relPath: String) : Route()

    /** Desvio temporário para `location`. */
    data class Redirect(val location: String) : Route()

    object NotFound : Route()
}

object RouteResolver {
    /**
     * Mapeia o path da requisição (já decodificado pelo servidor) em uma rota.
     * Qualquer ".." derruba a requisição — guard de path traversal.
     *
     * `/` e `/controle` redirecionam em vez de servir o HTML direto: as páginas
     * referenciam seus scripts por caminho relativo (`./game.js`,
     * `../vendor/qrcode.min.js`), que só resolvem certo se a URL da página for
     * `/game/index.html` / `/controle/index.html`. Servindo o HTML em `/`, o
     * navegador pediria `/game.js` e tomaria 404. As URLs de entrada continuam
     * as mesmas (o QR segue apontando para `/controle`).
     */
    fun resolve(path: String): Route {
        if (path.contains("..")) return Route.NotFound
        return when (val rel = path.trimStart('/')) {
            "" -> Route.Redirect("/menu/index.html")
            "controle", "controle/" -> Route.Redirect("/controle/index.html")
            "config" -> Route.Config
            "update" -> Route.Update
            "ws" -> Route.Ws
            else -> Route.Asset(rel)
        }
    }
}

/** MIME type pelo sufixo do arquivo. */
fun mimeTypeFor(path: String): String = when {
    path.endsWith(".html") -> "text/html"
    path.endsWith(".js") -> "text/javascript"
    path.endsWith(".css") -> "text/css"
    path.endsWith(".json") -> "application/json"
    path.endsWith(".png") -> "image/png"
    else -> "application/octet-stream"
}
