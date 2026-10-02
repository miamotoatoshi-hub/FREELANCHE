package app.freelanche.tracker;

import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;

/**
 * Checks that a purchase really was signed by Google Play.
 *
 * Every purchase the Play Billing Library hands over carries its original JSON text and a digital signature made
 * with a private key only Google holds. The matching public "licence key" is shown in Play Console (Monetize with
 * Play → Monetization setup → Licensing); it is not secret and is built into the app at compile time.
 *
 * A fake Play Store (the kind that "unlocks" paid apps on tampered phones) can invent purchase objects, but it
 * cannot produce a signature that verifies — so those purchases are rejected here and never reach the app's rules.
 */
final class PurchaseSecurity {

    /** What Google Play signs purchases with. */
    private static final String SIGNATURE_ALGORITHM = "SHA1withRSA";

    /** Decodes base64 text (replaceable so the logic can be tested on a plain JVM). */
    interface Base64Decoder {
        byte[] decode(String text);
    }

    private static final Base64Decoder ANDROID_DECODER = text -> Base64.decode(text, Base64.DEFAULT);

    private PurchaseSecurity() {}

    /** True only if {@code base64Signature} is Google's signature of exactly {@code signedData}. Never throws. */
    static boolean isSignatureValid(String base64LicenseKey, String signedData, String base64Signature) {
        return isSignatureValid(ANDROID_DECODER, base64LicenseKey, signedData, base64Signature);
    }

    static boolean isSignatureValid(Base64Decoder decoder, String base64LicenseKey, String signedData, String base64Signature) {
        if (isEmpty(base64LicenseKey) || isEmpty(signedData) || isEmpty(base64Signature)) {
            return false;
        }
        try {
            PublicKey key = KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(decoder.decode(base64LicenseKey)));
            Signature verifier = Signature.getInstance(SIGNATURE_ALGORITHM);
            verifier.initVerify(key);
            verifier.update(signedData.getBytes(StandardCharsets.UTF_8));
            return verifier.verify(decoder.decode(base64Signature));
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            return false;
        }
    }

    private static boolean isEmpty(String text) {
        return text == null || text.isEmpty();
    }
}
