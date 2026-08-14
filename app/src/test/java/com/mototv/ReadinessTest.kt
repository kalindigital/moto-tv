package com.mototv

import com.mototv.server.Readiness
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.ServerSocket

class ReadinessTest {
    @Test fun retorna_true_quando_a_porta_esta_aceitando() {
        val ss = ServerSocket(0) // porta efêmera, aceitando conexões
        try {
            assertTrue(Readiness.awaitPortOpen("127.0.0.1", ss.localPort, 2000, 50))
        } finally {
            ss.close()
        }
    }

    @Test fun retorna_false_quando_a_porta_nao_abre() {
        val ss = ServerSocket(0)
        val port = ss.localPort
        ss.close() // porta liberada/fechada
        assertFalse(Readiness.awaitPortOpen("127.0.0.1", port, 300, 50))
    }
}
