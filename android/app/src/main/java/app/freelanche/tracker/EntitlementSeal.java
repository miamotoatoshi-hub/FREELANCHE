package app.freelanche.tracker;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.Key;
import java.security.KeyStore;
import java.security.MessageDigest;
import javax.crypto.KeyGenerator;
import javax.crypto.Mac;
import javax.crypto.SecretKey;

/**
 * Stamps the app's remembered subscription check so that it cannot be edited, copied to another phone or restored
 * from a backup.
 *
 * The stamp is an HMAC-SHA256 made with a key that lives in the Android Keystore: this app can use it, but nothing
 * (not even the app's own code) can read it out, and it is not part of any backup. Text stamped on one phone does
 * not verify on another, and text that was changed after stamping does not verify anywhere.
 */
final class EntitlementSeal {

    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "freelanche_entitlement_seal";
    private static final String MAC_ALGORITHM = "HmacSHA256";

    private EntitlementSeal() {}

    /** The stamp for {@code text}, as lowercase hex. */
    static String sign(String text) throws GeneralSecurityException, IOException {
        return hmacHex(keystoreKey(), text);
    }

    /** True only if {@code mac} is this device's stamp for exactly {@code text}. */
    static boolean verify(String text, String mac) throws GeneralSecurityException, IOException {
        return macMatches(keystoreKey(), text, mac);
    }

    // The two functions below take the key as a parameter so they can be tested on a plain JVM.

    static String hmacHex(SecretKey key, String text) throws GeneralSecurityException {
        Mac mac = Mac.getInstance(MAC_ALGORITHM);
        mac.init(key);
        byte[] bytes = mac.doFinal(text.getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            hex.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
        }
        return hex.toString();
    }

    static boolean macMatches(SecretKey key, String text, String mac) throws GeneralSecurityException {
        if (text == null || mac == null) {
            return false;
        }
        byte[] expected = hmacHex(key, text).getBytes(StandardCharsets.UTF_8);
        // Constant-time comparison.
        return MessageDigest.isEqual(expected, mac.getBytes(StandardCharsets.UTF_8));
    }

    private static synchronized SecretKey keystoreKey() throws GeneralSecurityException, IOException {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);
        Key existing = keyStore.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) {
            return (SecretKey) existing;
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256, ANDROID_KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_SIGN).build());
        return generator.generateKey();
    }
}
