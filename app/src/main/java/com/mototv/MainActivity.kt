package com.mototv

import android.annotation.SuppressLint
import android.app.Activity
import android.net.http.SslError
import android.os.Bundle
import android.webkit.SslErrorHandler
import android.webkit.WebView
import android.webkit.WebViewClient
import com.mototv.cert.CertFactory
import com.mototv.net.NetworkUtils
import com.mototv.server.AndroidAssetReader
import com.mototv.server.GameServer
import com.mototv.server.HTTPS_PORT
import com.mototv.server.ServerConfig

class MainActivity : Activity() {

    // Para testar no emulador: coloque aqui o IP do seu Mac na WiFi e rode
    // `adb forward tcp:8443 tcp:8443`. Na TV real, deixe null.
    private val devOverrideIp: String? = null

    private lateinit var webView: WebView
    private var server: GameServer? = null
    private val keyPass = "changeit".toCharArray()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val ip = NetworkUtils.pickSiteLocalIpv4(NetworkUtils.localIpAddresses()) ?: "127.0.0.1"
        val controllerUrl = NetworkUtils.resolveControllerUrl(ip, HTTPS_PORT, devOverrideIp)
        val keyStore = CertFactory.buildKeyStore("moto", keyPass, listOf(ip, "127.0.0.1"))

        try {
            server = GameServer(
                assets = AndroidAssetReader(this),
                config = ServerConfig(controllerUrl),
                keyStore = keyStore,
                keyAlias = "moto",
                keyPassword = keyPass,
            ).also { it.start() }
        } catch (e: Exception) {
            android.util.Log.e("MainActivity", "Falha ao iniciar o servidor local", e)
        }

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            webViewClient = object : WebViewClient() {
                // Aceita o cert autoassinado do PRÓPRIO servidor local (protótipo).
                override fun onReceivedSslError(v: WebView?, h: SslErrorHandler?, e: SslError?) {
                    h?.proceed()
                }
            }
        }
        setContentView(webView)
        webView.loadUrl("https://127.0.0.1:$HTTPS_PORT/")
    }

    override fun onDestroy() {
        server?.stop()
        super.onDestroy()
    }
}
