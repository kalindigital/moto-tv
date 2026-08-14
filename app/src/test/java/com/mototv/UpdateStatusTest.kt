package com.mototv

import com.mototv.server.UpdateStatus
import com.mototv.server.toJson
import org.junit.Assert.assertEquals
import org.junit.Test

class UpdateStatusTest {
    @Test fun sem_atualizacao_serializa_so_a_flag() {
        assertEquals("{\"disponivel\":false}", UpdateStatus(disponivel = false).toJson())
    }

    @Test fun com_atualizacao_serializa_versao_e_changelog() {
        val json = UpdateStatus(true, "0.2.0", "- Banner de atualização").toJson()
        assertEquals(
            "{\"disponivel\":true,\"versao\":\"0.2.0\"," +
                "\"changelog\":\"- Banner de atualização\"}",
            json,
        )
    }

    @Test fun changelog_com_aspas_e_quebras_de_linha_e_escapado() {
        // O corpo do release vem do GitHub em markdown: sem escape, o JSON quebra
        // e o banner some inteiro.
        val json = UpdateStatus(true, "1.0", "linha 1\nagora com \"aspas\" e \\barra").toJson()
        assertEquals(
            "{\"disponivel\":true,\"versao\":\"1.0\"," +
                "\"changelog\":\"linha 1\\nagora com \\\"aspas\\\" e \\\\barra\"}",
            json,
        )
    }
}
