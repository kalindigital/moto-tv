package com.mototv.server

import android.content.Context
import com.mototv.cert.CertFactory
import com.mototv.net.NetworkUtils

/**
 * Servidor local como singleton de processo. A Activity pode ser recriada
 * (mudança de uiMode/densidade na TV dispara onCreate mais de uma vez); se
 * cada onCreate subisse um GameServer, o segundo estouraria a porta HTTPS
 * (BindException). Aqui o servidor sobe no máximo uma vez por processo.
 */
object ServerHolder {
    @Volatile private var server: GameServer? = null

    @Synchronized
    fun ensureStarted(appContext: Context, devOverrideIp: String?) {
        if (server != null) return
        val keyPass = "changeit".toCharArray()
        val ip = NetworkUtils.pickSiteLocalIpv4(NetworkUtils.localIpAddresses()) ?: "127.0.0.1"
        val controllerUrl = NetworkUtils.resolveControllerUrl(ip, HTTPS_PORT, devOverrideIp)
        val keyStore = CertFactory.buildKeyStore("moto", keyPass, listOf(ip, "127.0.0.1"))
        server = GameServer(
            assets = AndroidAssetReader(appContext.applicationContext),
            config = ServerConfig(controllerUrl),
            keyStore = keyStore,
            keyPassword = keyPass,
        ).also { it.start() }
    }
}
