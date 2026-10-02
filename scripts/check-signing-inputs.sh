#!/usr/bin/env bash
#
# Checks the signing inputs BEFORE the long build starts, so a mistake shows up in seconds with a plain-English message
# instead of five minutes into Gradle. It never prints a password, a key or the licence key.
#
# Reads these environment variables:
#   FREELANCHE_UPLOAD_STORE_FILE        path to the upload key file (.jks)
#   FREELANCHE_UPLOAD_STORE_PASSWORD    its password
#   FREELANCHE_UPLOAD_KEY_ALIAS         the key's name inside the file (normally: upload)
#   FREELANCHE_UPLOAD_KEY_PASSWORD      the key's password (for a standard key file: the same as the store password)
#   FREELANCHE_PLAY_LICENSE_KEY         the PUBLIC licence key from Play Console
#
# Exit code 0 = everything usable. Anything else = a message saying what to fix.
set -uo pipefail

problems=0
problem() { echo "::error::$1"; problems=$((problems + 1)); }

need() {
  local name="$1"
  if [ -z "${!name:-}" ]; then problem "$2"; return 1; fi
  return 0
}

# A copied value that ends (or starts) with a space or line break is the most common beginner mistake.
clean() {
  local name="$1" label="$2" value="${!1:-}"
  if [[ "$value" =~ ^[[:space:]] || "$value" =~ [[:space:]]$ ]]; then
    problem "$label starts or ends with a space or a line break. Re-create that GitHub secret and paste the value without pressing Enter or Space afterwards."
    return 1
  fi
  return 0
}

need FREELANCHE_UPLOAD_STORE_FILE "Internal error: the key file was not unpacked." || true
need FREELANCHE_UPLOAD_STORE_PASSWORD "The secret UPLOAD_STORE_PASSWORD is empty." || true
need FREELANCHE_UPLOAD_KEY_ALIAS "The secret UPLOAD_KEY_ALIAS is empty (normally it is: upload)." || true
need FREELANCHE_UPLOAD_KEY_PASSWORD "The secret UPLOAD_KEY_PASSWORD is empty." || true
need FREELANCHE_PLAY_LICENSE_KEY "The secret PLAY_LICENSE_KEY is empty." || true
[ "$problems" -eq 0 ] || exit 1

clean FREELANCHE_UPLOAD_STORE_PASSWORD "UPLOAD_STORE_PASSWORD" || true
clean FREELANCHE_UPLOAD_KEY_ALIAS "UPLOAD_KEY_ALIAS" || true
clean FREELANCHE_UPLOAD_KEY_PASSWORD "UPLOAD_KEY_PASSWORD" || true

# The licence key is public text; spaces or line breaks inside it are harmless, so they are ignored (as the build does).
if ! printf '%s' "$FREELANCHE_PLAY_LICENSE_KEY" | tr -d '[:space:]' | base64 -d 2>/dev/null | openssl rsa -pubin -inform DER -noout >/dev/null 2>&1; then
  problem "PLAY_LICENSE_KEY is not a valid Google Play licence key. Copy it again from Play Console (Monetize with Play > Monetization setup > Licensing); it is one long line of letters and digits."
fi

# Stop here if a value is obviously malformed: opening the key file with it would only add a confusing second message.
[ "$problems" -eq 0 ] || exit 1

if [ ! -s "$FREELANCHE_UPLOAD_STORE_FILE" ]; then
  problem "The key file is empty. UPLOAD_KEYSTORE_BASE64 was probably not copied completely - make the text again from your .jks file and paste all of it."
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# 1. Does the key file open with the store password?
if ! keytool -list -keystore "$FREELANCHE_UPLOAD_STORE_FILE" -storepass:env FREELANCHE_UPLOAD_STORE_PASSWORD >"$work/list.txt" 2>&1; then
  problem "The key file could not be opened. Either UPLOAD_KEYSTORE_BASE64 is incomplete or damaged, or UPLOAD_STORE_PASSWORD is wrong."
  [ "$problems" -eq 0 ] || exit 1
fi

# 2. Is there a key with that name inside?
if ! keytool -list -keystore "$FREELANCHE_UPLOAD_STORE_FILE" -alias "$FREELANCHE_UPLOAD_KEY_ALIAS" -storepass:env FREELANCHE_UPLOAD_STORE_PASSWORD >"$work/entry.txt" 2>&1; then
  found="$(sed -n 's/^\([^,]*\), .*\(PrivateKeyEntry\).*/\1/p' "$work/list.txt" | paste -sd, - )"
  problem "The key file opened, but it has no key with the name in UPLOAD_KEY_ALIAS. Keys inside the file: ${found:-none found}. (The name is normally: upload)"
  exit 1
fi

# 3. Does the key work with the key password? Prove it by signing a tiny test file (the result is thrown away).
printf 'x' >"$work/x.txt" && (cd "$work" && jar cf test.jar x.txt)
if ! jarsigner -keystore "$FREELANCHE_UPLOAD_STORE_FILE" -storepass:env FREELANCHE_UPLOAD_STORE_PASSWORD -keypass:env FREELANCHE_UPLOAD_KEY_PASSWORD "$work/test.jar" "$FREELANCHE_UPLOAD_KEY_ALIAS" >"$work/sign.txt" 2>&1; then
  problem "The key could not be used. UPLOAD_KEY_PASSWORD is probably wrong. For a standard key file it must be exactly the same as UPLOAD_STORE_PASSWORD."
  exit 1
fi

[ "$problems" -eq 0 ] || exit 1

fingerprint="$(sed -n 's/^Certificate fingerprint (SHA-256): *//p' "$work/entry.txt" | head -1)"
echo "The upload key opens and works."
echo "Its fingerprint (SHA-256, public - safe to share): ${fingerprint:-unavailable}"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### Upload key check passed"
    echo "Fingerprint (SHA-256, public): \`${fingerprint:-unavailable}\`"
  } >>"$GITHUB_STEP_SUMMARY"
fi
