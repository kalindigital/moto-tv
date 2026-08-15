package com.mototv.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Atualização pelo GitHub Releases: o app compara a versão instalada com a do
 * último release, baixa o APK anexado e entrega ao instalador do sistema.
 *
 * Usa HttpURLConnection (do próprio Android) em vez de OkHttp para não engordar
 * as dependências do protótipo. Todos os métodos de rede bloqueiam — chame
 * sempre de uma thread de fundo, nunca da UI thread.
 */
class UpdateService(private val context: Context) {

    /** GET em releases/latest; nulo se a rede falhar ou não houver versão nova. */
    fun checkLatest(repo: String, currentVersion: String): UpdateInfo? {
        if (repo.isBlank()) return null
        val corpo = baixarTexto("https://api.github.com/repos/$repo/releases/latest") ?: return null
        return GithubUpdates.parse(corpo, currentVersion)
    }

    /**
     * Baixa o APK para a área do próprio app, informando o progresso em porcento.
     * Devolve nulo se a rede falhar. O arquivo tem nome fixo: uma atualização
     * interrompida é simplesmente sobrescrita na próxima tentativa.
     */
    fun download(info: UpdateInfo, onProgress: (Int) -> Unit): File? {
        val pasta = File(context.getExternalFilesDir(null) ?: context.cacheDir, "updates")
        if (!pasta.exists() && !pasta.mkdirs()) return null
        val destino = File(pasta, "moto-tv.apk")

        return runCatching {
            val conexao = abrir(URL(info.apkUrl))
            try {
                if (conexao.responseCode !in 200..299) return null
                // contentLength (Int) e não contentLengthLong: este só existe da
                // API 24 para cima e o minSdk aqui é 21. APK não passa de 2 GB.
                val total = conexao.contentLength.toLong()
                var baixado = 0L
                var ultimoPct = -1
                conexao.inputStream.use { entrada ->
                    destino.outputStream().use { saida ->
                        val buffer = ByteArray(64 * 1024)
                        while (true) {
                            val lidos = entrada.read(buffer)
                            if (lidos <= 0) break
                            saida.write(buffer, 0, lidos)
                            baixado += lidos
                            if (total > 0) {
                                val pct = (baixado * 100 / total).toInt()
                                // Só avisa quando o número muda: senão seriam
                                // milhares de saltos para a WebView por download.
                                if (pct != ultimoPct) {
                                    ultimoPct = pct
                                    onProgress(pct)
                                }
                            }
                        }
                    }
                }
            } finally {
                conexao.disconnect()
            }
            destino
        }.getOrNull()
    }

    /** Abre o instalador do sistema; o usuário confirma na tela da TV. */
    fun install(apk: File) {
        val uri: Uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", apk)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

    private fun baixarTexto(url: String): String? = runCatching {
        val conexao = abrir(URL(url))
        try {
            if (conexao.responseCode !in 200..299) return null
            conexao.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conexao.disconnect()
        }
    }.getOrNull()

    private fun abrir(url: URL): HttpURLConnection =
        (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = TIMEOUT_MS
            readTimeout = TIMEOUT_MS
            instanceFollowRedirects = true
            setRequestProperty("Accept", "application/vnd.github+json")
            // A API do GitHub recusa requisição sem User-Agent (403).
            setRequestProperty("User-Agent", "MotoTV-Android")
        }

    private companion object {
        const val TIMEOUT_MS = 10_000
    }
}
