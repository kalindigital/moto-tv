package com.mototv.server

data class ServerConfig(val controllerUrl: String)

fun ServerConfig.toJson(): String =
    "{\"controllerUrl\":\"$controllerUrl\"}"
