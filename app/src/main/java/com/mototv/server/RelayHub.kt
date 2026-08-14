package com.mototv.server

import io.ktor.server.websocket.DefaultWebSocketServerSession

class RelayHub {
    suspend fun join(session: DefaultWebSocketServerSession) {}
}
