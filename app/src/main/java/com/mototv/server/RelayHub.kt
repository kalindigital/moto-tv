package com.mototv.server

import io.ktor.server.websocket.DefaultWebSocketServerSession
import io.ktor.websocket.Frame
import io.ktor.websocket.WebSocketSession
import io.ktor.websocket.readText
import java.util.Collections

class RelayHub {
    private val sessions: MutableSet<WebSocketSession> =
        Collections.synchronizedSet(LinkedHashSet())

    suspend fun join(session: DefaultWebSocketServerSession) {
        sessions.add(session)
        try {
            for (frame in session.incoming) {
                if (frame is Frame.Text) broadcast(frame.readText(), session)
            }
        } finally {
            sessions.remove(session)
        }
    }

    private suspend fun broadcast(text: String, from: WebSocketSession) {
        val targets = synchronized(sessions) { sessions.filter { it !== from } }
        targets.forEach { it.send(Frame.Text(text)) }
    }
}
