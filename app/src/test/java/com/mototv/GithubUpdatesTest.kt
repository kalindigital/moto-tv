package com.mototv

import com.mototv.update.GithubUpdates
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GithubUpdatesTest {

    private fun release(tag: String, corpo: String = "- Novidades", asset: String? = "moto-tv.apk") =
        """
        {
          "tag_name": "$tag",
          "body": "$corpo",
          "assets": [
            ${asset?.let { """{"name":"$it","browser_download_url":"https://exemplo/$it"}""" } ?: ""}
          ]
        }
        """.trimIndent()

    @Test fun versao_mais_nova_vira_atualizacao() {
        val info = GithubUpdates.parse(release("v0.2.0"), "0.1")
        assertNotNull(info)
        assertEquals("0.2.0", info!!.version)
        assertEquals("- Novidades", info.changelog)
        assertEquals("https://exemplo/moto-tv.apk", info.apkUrl)
    }

    @Test fun tag_sem_v_tambem_funciona() {
        assertEquals("0.3.1", GithubUpdates.parse(release("0.3.1"), "0.1")?.version)
    }

    @Test fun versao_igual_nao_oferece_atualizacao() {
        assertNull(GithubUpdates.parse(release("v0.1"), "0.1"))
    }

    @Test fun versao_antiga_nao_oferece_atualizacao() {
        assertNull(GithubUpdates.parse(release("v0.0.9"), "0.1"))
    }

    @Test fun release_sem_apk_e_ignorado() {
        // Release só com o .zip do código-fonte: não há o que instalar.
        val semApk = """
            {"tag_name":"v9.0.0","body":"x","assets":[{"name":"fontes.zip",
            "browser_download_url":"https://exemplo/fontes.zip"}]}
        """.trimIndent()
        assertNull(GithubUpdates.parse(semApk, "0.1"))
    }

    @Test fun release_sem_lista_de_assets_e_ignorado() {
        assertNull(GithubUpdates.parse("""{"tag_name":"v9.0.0","body":"x"}""", "0.1"))
    }

    @Test fun json_quebrado_nao_estoura() {
        assertNull(GithubUpdates.parse("não é json", "0.1"))
        assertNull(GithubUpdates.parse("", "0.1"))
        assertNull(GithubUpdates.parse("{\"tag_name\":", "0.1"))
    }

    @Test fun tag_vazia_e_ignorada() {
        assertNull(GithubUpdates.parse(release(""), "0.1"))
    }

    @Test fun comparacao_e_numerica_nao_alfabetica() {
        // O ponto do teste: em ordem alfabética "1.10.0" < "1.9.0", o que estaria errado.
        assertTrue(GithubUpdates.isNewer("1.10.0", "1.9.0"))
        assertFalse(GithubUpdates.isNewer("1.9.0", "1.10.0"))
    }

    @Test fun comparacao_cobre_igual_maior_e_menor() {
        assertTrue(GithubUpdates.isNewer("0.2", "0.1"))
        assertFalse(GithubUpdates.isNewer("0.1", "0.1"))
        assertFalse(GithubUpdates.isNewer("0.1", "0.2"))
    }

    @Test fun segmentos_faltando_valem_zero() {
        assertTrue(GithubUpdates.isNewer("1.0.1", "1.0"))
        assertFalse(GithubUpdates.isNewer("1.0", "1.0.0"))
        assertTrue(GithubUpdates.isNewer("v2", "1.9.9"))
    }

    @Test fun sufixo_nao_numerico_no_segmento_e_tolerado() {
        // Tags do tipo "1.2.0-beta" não podem derrubar a comparação.
        assertTrue(GithubUpdates.isNewer("1.2.0-beta", "1.1.0"))
    }
}
