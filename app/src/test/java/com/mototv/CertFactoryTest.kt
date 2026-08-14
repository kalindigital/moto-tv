package com.mototv

import com.mototv.cert.CertFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.cert.X509Certificate

class CertFactoryTest {
    @Test fun gera_keystore_autoassinado() {
        val ks = CertFactory.buildKeyStore("moto", "changeit".toCharArray(), listOf("127.0.0.1"))
        assertTrue(ks.isKeyEntry("moto"))
        val cert = ks.getCertificate("moto") as X509Certificate
        // autoassinado: emissor == sujeito
        assertEquals(cert.issuerX500Principal, cert.subjectX500Principal)
        cert.checkValidity() // não lança se estiver dentro da validade
    }
}
