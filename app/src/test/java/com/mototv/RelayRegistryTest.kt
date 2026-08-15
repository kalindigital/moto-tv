package com.mototv

import com.mototv.server.RelayRegistry
import org.junit.Assert.assertEquals
import org.junit.Test

class RelayRegistryTest {
    @Test fun remetente_fica_fora_do_proprio_broadcast() {
        val reg = RelayRegistry<Any>()
        val celular = Any()
        val jogo = Any()
        val terceiro = Any()
        reg.add(celular)
        reg.add(jogo)
        reg.add(terceiro)

        assertEquals(listOf(jogo, terceiro), reg.targetsFor(celular))
    }

    @Test fun peer_removido_nao_recebe_mais() {
        val reg = RelayRegistry<Any>()
        val celular = Any()
        val jogo = Any()
        reg.add(celular)
        reg.add(jogo)
        reg.remove(jogo)

        assertEquals(emptyList<Any>(), reg.targetsFor(celular))
    }

    @Test fun peer_sozinho_nao_tem_para_quem_mandar() {
        val reg = RelayRegistry<Any>()
        val jogo = Any()
        reg.add(jogo)

        assertEquals(emptyList<Any>(), reg.targetsFor(jogo))
    }
}
