#!/usr/bin/env bash
#
# After the build: proves the .aab really is signed with YOUR upload key (not unsigned, not a debug key), looks like a
# real app bundle, and prints its size and checksum. Never prints a password.
#
#   bash scripts/verify-signed-bundle.sh path/to/app-release.aab
#
# Reads the same environment variables as check-signing-inputs.sh (the key file, store password and alias).
set -uo pipefail

aab="${1:-}"
problems=0
problem() { echo "::error::$1"; problems=$((problems + 1)); }

[ -n "$aab" ] && [ -s "$aab" ] || { problem "The bundle was not produced (expected: ${aab:-a path to an .aab file})."; exit 1; }

# Does it look like an Android App Bundle?
# (Plain string matching on purpose: `echo "$big" | grep -q ...` fails under `pipefail` when grep quits early, which a real, large bundle triggers.)
listing="$(unzip -l "$aab" 2>/dev/null || true)"
[[ "$listing" == *"BundleConfig.pb"* ]] || problem "This file does not look like an Android App Bundle (BundleConfig.pb is missing)."
[[ "$listing" == *"base/manifest/AndroidManifest.xml"* ]] || problem "This file does not look like an Android App Bundle (the app manifest is missing)."

# Is it signed at all, and does the signature check out?
verify_out="$(jarsigner -verify "$aab" 2>&1)"; verify_status=$?
if [ "$verify_status" -ne 0 ] || [[ "${verify_out,,}" == *unsigned* ]]; then
  problem "The bundle is NOT signed (or its signature is broken). Google Play would reject it."
  exit 1
elif [[ "$verify_out" != *"jar verified"* ]]; then
  problem "The bundle's signature could not be verified."
fi

# Is it signed with THE key you supplied?
wanted="$(keytool -list -keystore "${FREELANCHE_UPLOAD_STORE_FILE:-/nonexistent}" -alias "${FREELANCHE_UPLOAD_KEY_ALIAS:-}" -storepass:env FREELANCHE_UPLOAD_STORE_PASSWORD 2>/dev/null | sed -n 's/^Certificate fingerprint (SHA-256): *//p' | head -1)"
signed_with="$(keytool -printcert -jarfile "$aab" 2>/dev/null | sed -n 's/^[[:space:]]*SHA256: *//p' | head -1)"
if [ -z "$wanted" ]; then
  problem "Could not read your upload key's fingerprint to compare with."
elif [ -z "$signed_with" ]; then
  problem "Could not read the signer of the bundle."
elif [ "$wanted" != "$signed_with" ]; then
  problem "The bundle is signed with a DIFFERENT key than your upload key. Do not upload it."
fi

[ "$problems" -eq 0 ] || exit 1

size="$(du -h "$aab" | cut -f1)"
sum="$(sha256sum "$aab" | cut -d' ' -f1)"
echo "The bundle is signed with your upload key and looks like a valid Android App Bundle."
echo "Size: $size   SHA-256 of the file: $sum"
echo "Signed with key fingerprint (public): $signed_with"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### Bundle check passed"
    echo "- Size: $size"
    echo "- File SHA-256: \`$sum\`"
    echo "- Signed with upload key fingerprint (public): \`$signed_with\`"
  } >>"$GITHUB_STEP_SUMMARY"
fi
