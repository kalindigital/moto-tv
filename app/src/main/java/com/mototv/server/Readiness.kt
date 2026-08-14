package com.mototv.server

import java.net.InetSocketAddress
import java.net.Socket

object Readiness {
    /**
     * Tenta abrir uma conexão TCP em host:port repetidamente até conseguir
     * (servidor aceitando conexões) ou estourar o timeout. Usado para só
     * carregar a URL no WebView depois que o servidor local subiu — evita
     * ERR_CONNECTION_CLOSED por corrida entre o start do servidor e o load.
     */
    fun awaitPortOpen(host: String, port: Int, timeoutMs: Long, intervalMs: Long = 100): Boolean {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            try {
                Socket().use { it.connect(InetSocketAddress(host, port), 500) }
                return true
            } catch (e: Exception) {
                try {
                    Thread.sleep(intervalMs)
                } catch (ie: InterruptedException) {
                    Thread.currentThread().interrupt()
                    return false
                }
            }
        }
        return false
    }
}
