package com.mototv.net

import java.net.NetworkInterface

object NetworkUtils {
    fun isSiteLocalIpv4(ip: String): Boolean {
        val parts = ip.split(".")
        if (parts.size != 4 || parts.any { it.toIntOrNull() == null }) return false
        val (a, b) = parts[0].toInt() to parts[1].toInt()
        return when (a) {
            10 -> true
            192 -> b == 168
            172 -> b in 16..31
            else -> false
        }
    }

    fun pickSiteLocalIpv4(addrs: List<String>): String? =
        addrs.firstOrNull { isSiteLocalIpv4(it) }

    fun resolveControllerUrl(ip: String, port: Int, devOverrideIp: String?): String {
        val host = devOverrideIp?.takeIf { it.isNotBlank() } ?: ip
        return "https://$host:$port/controle"
    }

    /** Uso real no app (não coberto por teste unitário). */
    fun localIpAddresses(): List<String> =
        NetworkInterface.getNetworkInterfaces().toList()
            .flatMap { it.inetAddresses.toList() }
            .filter { !it.isLoopbackAddress && it.address.size == 4 }
            .map { it.hostAddress ?: "" }
            .filter { it.isNotBlank() }
}
