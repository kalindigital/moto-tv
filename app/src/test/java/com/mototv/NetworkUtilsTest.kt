package com.mototv

import com.mototv.net.NetworkUtils
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NetworkUtilsTest {
    @Test fun reconhece_ip_local() {
        assertTrue(NetworkUtils.isSiteLocalIpv4("192.168.0.10"))
        assertTrue(NetworkUtils.isSiteLocalIpv4("10.0.0.5"))
        assertTrue(NetworkUtils.isSiteLocalIpv4("172.16.4.4"))
        assertFalse(NetworkUtils.isSiteLocalIpv4("8.8.8.8"))
        assertFalse(NetworkUtils.isSiteLocalIpv4("127.0.0.1"))
    }

    @Test fun escolhe_o_primeiro_ip_local() {
        val addrs = listOf("127.0.0.1", "8.8.8.8", "192.168.1.20")
        assertEquals("192.168.1.20", NetworkUtils.pickSiteLocalIpv4(addrs))
    }

    @Test fun monta_url_do_controle() {
        assertEquals(
            "https://192.168.1.20:8443/controle",
            NetworkUtils.resolveControllerUrl("192.168.1.20", 8443, null)
        )
    }

    @Test fun override_de_dev_tem_prioridade() {
        assertEquals(
            "https://192.168.1.50:8443/controle",
            NetworkUtils.resolveControllerUrl("10.0.2.15", 8443, "192.168.1.50")
        )
    }
}
