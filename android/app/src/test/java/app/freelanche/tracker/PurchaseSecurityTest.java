package app.freelanche.tracker;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.util.Base64;
import org.junit.BeforeClass;
import org.junit.Test;

/** Runs on a plain JVM: the Base64 decoder is injected, so no Android runtime is needed. */
public class PurchaseSecurityTest {

    private static final PurchaseSecurity.Base64Decoder DECODER = text -> Base64.getDecoder().decode(text);
    private static final String PURCHASE_JSON =
        "{\"orderId\":\"GPA.1234\",\"packageName\":\"app.freelanche.tracker\",\"productId\":\"freelanche_premium\",\"purchaseTime\":1790000000000,\"purchaseState\":0,\"autoRenewing\":true}";

    private static KeyPair googleKeys;
    private static String licenseKey;
    private static String signature;

    @BeforeClass
    public static void setUp() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        googleKeys = generator.generateKeyPair();
        licenseKey = Base64.getEncoder().encodeToString(googleKeys.getPublic().getEncoded()); // the X.509 form Play Console shows
        signature = sign(googleKeys, PURCHASE_JSON);
    }

    private static String sign(KeyPair keys, String data) throws Exception {
        Signature signer = Signature.getInstance("SHA1withRSA"); // what Google Play uses
        signer.initSign(keys.getPrivate());
        signer.update(data.getBytes(StandardCharsets.UTF_8));
        return Base64.getEncoder().encodeToString(signer.sign());
    }

    @Test
    public void acceptsAPurchaseThatGoogleSigned() {
        assertTrue(PurchaseSecurity.isSignatureValid(DECODER, licenseKey, PURCHASE_JSON, signature));
    }

    @Test
    public void rejectsAPurchaseThatWasAltered() {
        String upgraded = PURCHASE_JSON.replace("\"purchaseState\":0", "\"purchaseState\":1").replace("1790000000000", "1999999999999");
        assertFalse(PurchaseSecurity.isSignatureValid(DECODER, licenseKey, upgraded, signature));
    }

    @Test
    public void rejectsAPurchaseSignedByAnyoneElse() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        KeyPair forger = generator.generateKeyPair();
        assertFalse(PurchaseSecurity.isSignatureValid(DECODER, licenseKey, PURCHASE_JSON, sign(forger, PURCHASE_JSON)));
    }

    @Test
    public void rejectsGarbageWithoutThrowing() {
        assertFalse(PurchaseSecurity.isSignatureValid(DECODER, licenseKey, PURCHASE_JSON, "not-base64!!"));
        assertFalse(PurchaseSecurity.isSignatureValid(DECODER, licenseKey, PURCHASE_JSON, Base64.getEncoder().encodeToString(new byte[] {1, 2, 3})));
        assertFalse(PurchaseSecurity.isSignatureValid(DECODER, "AAAA", PURCHASE_JSON, signature));
        assertFalse(PurchaseSecurity.isSignatureValid(DECODER, "###", PURCHASE_JSON, signature));
    }

    @Test
    public void rejectsMissingParts() {
        assertFalse(PurchaseSecurity.isSignatureValid(DECODER, null, PURCHASE_JSON, signature));
        assertFalse(PurchaseSecurity.isSignatureValid(DECODER, "", PURCHASE_JSON, signature));
        assertFalse(PurchaseSecurity.isSignatureValid(DECODER, licenseKey, null, signature));
        assertFalse(PurchaseSecurity.isSignatureValid(DECODER, licenseKey, PURCHASE_JSON, null));
        assertFalse(PurchaseSecurity.isSignatureValid(DECODER, licenseKey, PURCHASE_JSON, ""));
    }
}
