package com.mototv.cert

import org.bouncycastle.asn1.x500.X500Name
import org.bouncycastle.asn1.x509.Extension
import org.bouncycastle.asn1.x509.GeneralName
import org.bouncycastle.asn1.x509.GeneralNames
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder
import org.bouncycastle.jce.provider.BouncyCastleProvider
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder
import java.math.BigInteger
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Security
import java.util.Date

object CertFactory {
    init {
        if (Security.getProvider("BC") == null) Security.addProvider(BouncyCastleProvider())
    }

    fun buildKeyStore(alias: String, password: CharArray, ips: List<String>): KeyStore {
        val kp = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()
        val now = System.currentTimeMillis()
        val notBefore = Date(now - 24L * 60 * 60 * 1000)
        val notAfter = Date(now + 3650L * 24 * 60 * 60 * 1000)
        val subject = X500Name("CN=Moto TV")
        val builder = JcaX509v3CertificateBuilder(
            subject, BigInteger.valueOf(now), notBefore, notAfter, subject, kp.public
        )
        val altNames = mutableListOf(GeneralName(GeneralName.dNSName, "localhost"))
        ips.forEach { altNames.add(GeneralName(GeneralName.iPAddress, it)) }
        builder.addExtension(
            Extension.subjectAlternativeName, false,
            GeneralNames(altNames.toTypedArray())
        )
        val signer = JcaContentSignerBuilder("SHA256WithRSA").build(kp.private)
        val cert = JcaX509CertificateConverter().getCertificate(builder.build(signer))

        return KeyStore.getInstance("PKCS12").apply {
            load(null, null)
            setKeyEntry(alias, kp.private, password, arrayOf(cert))
        }
    }
}
