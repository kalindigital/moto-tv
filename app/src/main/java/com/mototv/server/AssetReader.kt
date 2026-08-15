package com.mototv.server

import android.content.Context

interface AssetReader {
    /** Lê o asset em web/<path>. Retorna null se não existir. */
    fun read(path: String): ByteArray?
}

class AndroidAssetReader(private val context: Context) : AssetReader {
    override fun read(path: String): ByteArray? =
        try {
            context.assets.open("web/$path").use { it.readBytes() }
        } catch (e: Exception) {
            null
        }
}
