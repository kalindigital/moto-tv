package com.mototv.server

import java.util.Collections

/**
 * Conjunto de peers conectados no relay. Genérico e sem tipos do servidor de
 * propósito: dá para testar a regra "não ecoa para o remetente" sem subir nada.
 */
class RelayRegistry<T : Any> {
    private val peers: MutableSet<T> = Collections.synchronizedSet(LinkedHashSet())

    fun add(peer: T) {
        peers.add(peer)
    }

    fun remove(peer: T) {
        peers.remove(peer)
    }

    /** Todos os peers menos o remetente: uma mensagem nunca volta para quem enviou. */
    fun targetsFor(sender: T): List<T> = synchronized(peers) { peers.filter { it !== sender } }
}
