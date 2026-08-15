package com.mototv

import android.annotation.SuppressLint
import android.app.Activity
import android.net.http.SslError
import android.os.Bundle
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.SslErrorHandler
import android.webkit.WebView
import android.webkit.WebViewClient
import com.mototv.server.HTTPS_PORT
import com.mototv.server.Readiness
import com.mototv.server.ServerHolder
import com.mototv.update.GITHUB_REPO
import com.mototv.update.UpdateHolder
import com.mototv.update.UpdateService
import java.util.concurrent.atomic.AtomicBoolean

class MainActivity : Activity() {

    // Para testar no emulador: coloque aqui o IP do seu Mac na WiFi e rode
    // `adb forward tcp:8443 tcp:8443`. Na TV real, deixe null.
    private val devOverrideIp: String? = null

    private lateinit var webView: WebView
    private lateinit var updates: UpdateService

    /** Uma atualização por vez: o banner pode receber vários OK seguidos. */
    private val baixando = AtomicBoolean(false)

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        updates = UpdateService(applicationContext)

        // O jogo não recebe toque na TV: sem isso a tela apaga no meio da partida.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            // Ponte para o banner de atualização servido pelo próprio app em
            // https://127.0.0.1 — nenhuma página externa é carregada aqui.
            addJavascriptInterface(PonteJs(), "MotoTV")
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

        checarAtualizacao()
    }

    /**
     * Consulta o GitHub em thread própria e deixa o resultado no UpdateHolder,
     * de onde a rota /update o serve. Nunca bloqueia o jogo: se a rede falhar,
     * o holder fica nulo e o banner simplesmente não aparece.
     */
    private fun checarAtualizacao() {
        if (UpdateHolder.info != null) return
        Thread {
            val achado = updates.checkLatest(GITHUB_REPO, BuildConfig.VERSION_NAME)
            if (achado != null) {
                UpdateHolder.info = achado
                android.util.Log.i("MainActivity", "Atualização disponível: ${achado.version}")
            }
        }.start()
    }

    /** Chamada pelo banner do jogo (window.MotoTV.baixarAtualizacao()). */
    private inner class PonteJs {
        @JavascriptInterface
        fun baixarAtualizacao() {
            val info = UpdateHolder.info ?: return
            if (!baixando.compareAndSet(false, true)) return
            Thread {
                val apk = updates.download(info) { pct -> avisaJs("window.__updateProgress($pct)") }
                if (apk != null) {
                    updates.install(apk)
                    // O instalador assume daqui; se o usuário recusar, o banner
                    // volta a aceitar OK para tentar de novo.
                    baixando.set(false)
                } else {
                    baixando.set(false)
                    avisaJs("window.__updateFalhou()")
                }
            }.start()
        }
    }

    /** evaluateJavascript só pode ser chamado da UI thread. */
    private fun avisaJs(script: String) {
        runOnUiThread {
            if (::webView.isInitialized) webView.evaluateJavascript(script, null)
        }
    }

    private fun statusHtml(msg: String): String =
        "<!doctype html><html><body style=\"margin:0;background:#0b0b12;color:#fff;" +
            "font-family:sans-serif;display:flex;align-items:center;justify-content:center;" +
            "height:100vh\"><h2>$msg</h2></body></html>"
}
