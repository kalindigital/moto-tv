package com.mototv.update

/** Repositório do GitHub que publica os releases do Moto TV. */
const val GITHUB_REPO = "kalindigital/moto-tv"

/**
 * Guarda a atualização encontrada na checagem do boot. É de processo porque
 * quem lê é o servidor HTTP (rota /update), que roda em outra thread e não tem
 * acesso à Activity — e a Activity pode ser recriada sem que a checagem repita.
 */
object UpdateHolder {
    @Volatile
    var info: UpdateInfo? = null
}
