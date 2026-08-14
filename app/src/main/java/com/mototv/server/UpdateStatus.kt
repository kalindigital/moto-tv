package com.mototv.server

/**
 * Estado da atualização servido em GET /update para a página do jogo.
 * Puro de propósito, no mesmo estilo do ServerConfig: sem tipos de Android.
 */
data class UpdateStatus(
    val disponivel: Boolean,
    val versao: String = "",
    val changelog: String = "",
)

fun UpdateStatus.toJson(): String =
    if (!disponivel) {
        "{\"disponivel\":false}"
    } else {
        "{\"disponivel\":true,\"versao\":\"${escapaJson(versao)}\"," +
            "\"changelog\":\"${escapaJson(changelog)}\"}"
    }

/**
 * Escapa o texto para caber dentro de uma string JSON. O changelog vem do corpo
 * do release no GitHub: tem aspas, barras e quebras de linha, que sem escape
 * quebrariam o JSON e derrubariam o banner inteiro.
 */
internal fun escapaJson(texto: String): String = buildString(texto.length) {
    for (c in texto) {
        when {
            c == '"' -> append("\\\"")
            c == '\\' -> append("\\\\")
            c == '\n' -> append("\\n")
            c == '\r' -> append("\\r")
            c == '\t' -> append("\\t")
            c < ' ' -> append("\\u%04x".format(c.code))
            else -> append(c)
        }
    }
}
