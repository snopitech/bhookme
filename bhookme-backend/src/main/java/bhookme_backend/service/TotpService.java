package bhookme_backend.service;

import org.apache.commons.codec.binary.Base32;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.security.SecureRandom;
import java.time.Instant;

@Service
public class TotpService {

    private static final SecureRandom secureRandom = new SecureRandom();
    private static final int SECRET_SIZE = 20; // 160 bits
    private static final int CODE_DIGITS = 6;
    private static final int TIME_STEP_SECONDS = 30;
    private static final String HMAC_ALGORITHM = "HmacSHA1";

    public String generateSecret() {
        byte[] bytes = new byte[SECRET_SIZE];
        secureRandom.nextBytes(bytes);
        Base32 base32 = new Base32();
        return base32.encodeAsString(bytes).replace("=", "");
    }

    public String generateTOTP(String secret) {
        return generateTOTPForTimeOffset(secret, 0);
    }

    public boolean verifyTOTP(String secret, String code) {
        for (int offset = -2; offset <= 2; offset++) {
            if (generateTOTPForTimeOffset(secret, offset).equals(code)) {
                return true;
            }
        }
        return false;
    }

    private String generateTOTPForTimeOffset(String secret, int windowOffset) {
        try {
            Base32 base32 = new Base32();
            byte[] secretBytes = base32.decode(secret);

            long timeWindow = Instant.now().getEpochSecond() / TIME_STEP_SECONDS;
            timeWindow += windowOffset;

            byte[] timeBytes = new byte[8];
            for (int i = 7; i >= 0; i--) {
                timeBytes[i] = (byte) (timeWindow & 0xff);
                timeWindow >>= 8;
            }

            SecretKeySpec signingKey = new SecretKeySpec(secretBytes, HMAC_ALGORITHM);
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(signingKey);
            byte[] hash = mac.doFinal(timeBytes);

            int offset = hash[hash.length - 1] & 0xf;
            int binary = ((hash[offset] & 0x7f) << 24) |
                    ((hash[offset + 1] & 0xff) << 16) |
                    ((hash[offset + 2] & 0xff) << 8) |
                    (hash[offset + 3] & 0xff);

            int code = binary % (int) Math.pow(10, CODE_DIGITS);
            return String.format("%06d", code);

        } catch (Exception e) {
            throw new RuntimeException("Failed to generate TOTP", e);
        }
    }
}