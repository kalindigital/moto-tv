package com.mototv

import com.mototv.server.ServerConfig
import com.mototv.server.toJson
import org.junit.Assert.assertEquals
import org.junit.Test

class ServerConfigTest {
    @Test fun serializa_para_json() {
        val json = ServerConfig("https://192.168.1.20:8443/controle").toJson()
        assertEquals("{\"controllerUrl\":\"https://192.168.1.20:8443/controle\"}", json)
    }
}
