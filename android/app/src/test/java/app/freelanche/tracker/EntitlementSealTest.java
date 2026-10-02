package app.freelanche.tracker;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.junit.Test;

/** The stamp's maths, with an ordinary key (the Android Keystore itself only exists on a phone). */
public class EntitlementSealTest {

    private static SecretKey key(String secret) {
        return new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    }

    @Test
    public void producesTheStandardHmacSha256AsHex() throws Exception {
        // Published HMAC-SHA256 test vector.
        assertEquals(
            "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
            EntitlementSeal.hmacHex(key("key"), "The quick brown fox jumps over the lazy dog")
        );
    }

    @Test
    public void acceptsTheStampOnlyForTheSameTextAndKey() throws Exception {
        String text = "{\"v\":1,\"lastVerifiedAt\":1790000000000,\"lastStatus\":\"active\"}";
        String mac = EntitlementSeal.hmacHex(key("this phone"), text);
        assertTrue(EntitlementSeal.macMatches(key("this phone"), text, mac));
        assertFalse(EntitlementSeal.macMatches(key("this phone"), text.replace("active", "inactive"), mac)); // edited
        assertFalse(EntitlementSeal.macMatches(key("another phone"), text, mac)); // copied or restored elsewhere
    }

    @Test
    public void rejectsMissingOrDamagedStamps() throws Exception {
        String mac = EntitlementSeal.hmacHex(key("k"), "text");
        assertFalse(EntitlementSeal.macMatches(key("k"), null, mac));
        assertFalse(EntitlementSeal.macMatches(key("k"), "text", null));
        assertFalse(EntitlementSeal.macMatches(key("k"), "text", ""));
        assertFalse(EntitlementSeal.macMatches(key("k"), "text", mac.substring(1)));
        assertFalse(EntitlementSeal.macMatches(key("k"), "text", mac.toUpperCase()));
    }
}
