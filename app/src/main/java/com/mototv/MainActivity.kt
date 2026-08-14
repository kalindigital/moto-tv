package com.mototv

import android.annotation.SuppressLint
import android.app.Activity
import android.net.http.SslError
import android.os.Bundle
import android.webkit.SslErrorHandler
import android.webkit.WebView
import android.webkit.WebViewClient
import com.mototv.server.HTTPS_PORT
import com.mototv.server.Readiness
import com.mototv.server.ServerHolder

class MainActivity : Activity() {

    // Para testar no emulador: coloque aqui o IP do seu Mac na WiFi e rode
    // `adb forward tcp:8443 tcp:8443`. Na TV real, deixe null.
    private val devOverrideIp: String? = null

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

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
        webView.loadDataWithBaseURL(null, statusHtml("Iniciando o jogo…"), "text/html", "utf-8", null)

        // Geração da chave + start do servidor são pesados e travariam a UI thread (ANR).
        // O servidor é um singleton de processo (ver ServerHolder): subir aqui é
        // idempotente e seguro mesmo se o onCreate rodar mais de uma vez.
        val appContext = applicationContext
        val dev = devOverrideIp
        Thread {
            try {
                ServerHolder.ensureStarted(appContext, dev)
                val ready = Readiness.awaitPortOpen("127.0.0.1", HTTPS_PORT, 15000)
                runOnUiThread {
                    if (ready) {
                        webView.loadUrl("https://127.0.0.1:$HTTPS_PORT/")
                    } else {
                        webView.loadDataWithBaseURL(
                            null, statusHtml("O servidor local não respondeu a tempo."),
                            "text/html", "utf-8", null,
                        )
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e("MainActivity", "Falha ao iniciar o servidor local", e)
                runOnUiThread {
                    webView.loadDataWithBaseURL(
                        null, statusHtml("Erro ao iniciar o servidor local."),
                        "text/html", "utf-8", null,
                    )
                }
            }
        }.start()
    }

    private fun statusHtml(msg: String): String =
        "<!doctype html><html><body style=\"margin:0;background:#0b0b12;color:#fff;" +
            "font-family:sans-serif;display:flex;align-items:center;justify-content:center;" +
            "height:100vh\"><h2>$msg</h2></body></html>"
}
