package com.mototv.server

import fi.iki.elonen.NanoHTTPD
import fi.iki.elonen.NanoHTTPD.IHTTPSession
import fi.iki.elonen.NanoHTTPD.Response
import fi.iki.elonen.NanoWSD
import java.io.ByteArrayInputStream
import java.io.IOException
import java.security.KeyStore
import javax.net.ssl.KeyManagerFactory

/**
 * 8444 e não 8443: no Android TV o receptor de Cast (com.google.android.apps.mediashell)
 * já ocupa 8008/8009/8443 desde o boot, e o bind em 8443 morre com EADDRINUSE
 * ("Address already in use") — era esse o erro atribuído ao SELinux/Netty.
 */
const val HTTPS_PORT = 8444

/**
 * Servidor local HTTPS + WebSocket em cima do NanoHTTPD.
 *
 * Por que não Ktor: o motor Netty no Android esbarra em SELinux ao ler
 * /proc/sys/net/core/somaxconn e o bind falha com "Address already in use"
 * mesmo com a porta livre; o motor CIO nem faz HTTPS ("CIO Engine does not
 * currently support HTTPS"). E HTTPS é obrigatório: o iOS só expõe
 * DeviceOrientation em contexto seguro e o manifesto proíbe cleartext.
 */
class GameServer(
    private val assets: AssetReader,
    private val config: ServerConfig,
    keyStore: KeyStore,
    keyPassword: CharArray,
    /**
     * Lida a cada requisição, não guardada: a checagem de atualização roda em
     * paralelo ao start do servidor e pode terminar depois dele.
     */
    private val atualizacao: () -> UpdateStatus = { UpdateStatus(disponivel = false) },
) : NanoWSD("0.0.0.0", HTTPS_PORT) {

    private val peers = RelayRegistry<WebSocket>()

    init {
        val kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm())
        kmf.init(keyStore, keyPassword)
        makeSecure(NanoHTTPD.makeSSLSocketFactory(keyStore, kmf), null)
    }

    /**
     * Sem SO_TIMEOUT (0) e daemon=false. O SOCKET_READ_TIMEOUT padrão (5 s)
     * mataria o WebSocket do jogo: ele só recebe, nunca envia, e o NanoWSD
     * trata SocketTimeoutException como fechamento da conexão.
     */
    override fun start() {
        start(0, false)
    }

    override fun openWebSocket(handshake: IHTTPSession): WebSocket = RelaySocket(handshake)

    override fun serveHttp(session: IHTTPSession): Response =
        when (val route = RouteResolver.resolve(session.uri)) {
            is Route.Config -> NanoHTTPD.newFixedLengthResponse(
                Response.Status.OK, "application/json", config.toJson(),
            )
            is Route.Update -> NanoHTTPD.newFixedLengthResponse(
                Response.Status.OK, "application/json", atualizacao().toJson(),
            )
            is Route.Asset -> assets.read(route.relPath)?.let { bytes ->
                NanoHTTPD.newFixedLengthResponse(
                    Response.Status.OK,
                    mimeTypeFor(route.relPath),
                    ByteArrayInputStream(bytes),
                    bytes.size.toLong(),
                )
            } ?: notFound()
            // 307 e não Status.REDIRECT: no NanoHTTPD, REDIRECT é 301 (permanente)
            // e a WebView guardaria o desvio em cache para sempre.
            is Route.Redirect -> NanoHTTPD.newFixedLengthResponse(
                Response.Status.TEMPORARY_REDIRECT, NanoHTTPD.MIME_HTML, "",
            ).apply { addHeader("Location", route.location) }
            // /ws sem upgrade de protocolo não é servível como HTTP.
            is Route.Ws -> notFound()
            is Route.NotFound -> notFound()
        }

    /**
     * Servindo em loopback/LAN, comprimir não ganha nada e o gzip do NanoHTTPD
     * troca o Content-Length por chunked — menos partes móveis nos assets.
     */
    override fun useGzipWhenAccepted(r: Response): Boolean = false

    private fun notFound(): Response =
        NanoHTTPD.newFixedLengthResponse(Response.Status.NOT_FOUND, NanoHTTPD.MIME_PLAINTEXT, "not found")

    /** Repassa cada frame de texto para todos os OUTROS peers (celular -> jogo). */
    private inner class RelaySocket(handshake: IHTTPSession) : WebSocket(handshake) {
        override fun onOpen() {
            peers.add(this)
        }

        override fun onClose(
            code: WebSocketFrame.CloseCode?,
            reason: String?,
            initiatedByRemote: Boolean,
        ) {
            peers.remove(this)
        }

        override fun onMessage(message: WebSocketFrame) {
            val text = message.textPayload ?: return
            peers.targetsFor(this).forEach { peer ->
                try {
                    peer.send(text)
                } catch (e: IOException) {
                    peers.remove(peer)
                }
            }
        }

        override fun onPong(pong: WebSocketFrame) = Unit

        override fun onException(exception: IOException) {
            peers.remove(this)
        }
    }
}
