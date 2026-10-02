#!/usr/bin/env bash
#
# Creates your Google Play UPLOAD KEY and the git-ignored file android/keystore.properties that the build reads.
#
# Run this on YOUR OWN computer, in a terminal, and type the passwords there. They are never printed, never put on a
# command line, and never leave your machine. Do not paste them into a chat, an email or a ticket — including with me.
#
#   bash scripts/create-upload-key.sh
#
# What an upload key is: Google Play signs the app that users install with its own key (Play App Signing). You sign each
# upload with this separate "upload key", so if it is ever lost Google can reset it. Keep the .jks file and its
# password in a password manager, and keep a backup copy of the .jks somewhere safe and offline.
#
# One password only: the standard key-file format (PKCS12) protects the file and the key inside it with the same
# password and ignores a separate key password, so offering two would only create a build that cannot sign.
set -euo pipefail

cd "$(dirname "$0")/.."

KEYSTORE_PATH="${KEYSTORE_PATH:-$HOME/freelanche-upload.jks}"
PROPS_PATH="${PROPS_PATH:-android/keystore.properties}"
KEY_ALIAS="upload"

command -v keytool >/dev/null 2>&1 || { echo "keytool was not found. Install a JDK (version 17 or newer, e.g. from https://adoptium.net) and try again." >&2; exit 1; }

if [ -e "$KEYSTORE_PATH" ]; then
  echo "A key already exists at $KEYSTORE_PATH — I will not overwrite it." >&2
  echo "If you meant to use it, just create $PROPS_PATH yourself (see docs/PLAY_CONSOLE_CHECKLIST.md, step 'Signing')." >&2
  exit 1
fi
if [ -e "$PROPS_PATH" ]; then
  echo "$PROPS_PATH already exists — I will not overwrite it. Move it away first if you want a new key." >&2
  exit 1
fi

echo "Creating your upload key at: $KEYSTORE_PATH"
echo
read -r -p "Your name or company (shown inside the certificate): " OWNER_NAME
[ -n "$OWNER_NAME" ] || { echo "A name is needed." >&2; exit 1; }

read_password() {
  local prompt="$1" first second
  while true; do
    read -r -s -p "$prompt (at least 12 characters, not shown as you type): " first; echo >&2
    if [ "${#first}" -lt 12 ]; then echo "Too short — use at least 12 characters." >&2; continue; fi
    read -r -s -p "Type it again to confirm: " second; echo >&2
    if [ "$first" != "$second" ]; then echo "They did not match — try again." >&2; continue; fi
    printf '%s' "$first"
    return 0
  done
}

PASSWORD="$(read_password 'Choose a password for the key file')"

# The password goes to keytool through an environment variable (-storepass:env), so it never appears in the process list.
export FREELANCHE_STOREPASS="$PASSWORD"
mkdir -p "$(dirname "$KEYSTORE_PATH")"
keytool -genkeypair -keystore "$KEYSTORE_PATH" -alias "$KEY_ALIAS" -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=$OWNER_NAME" -storepass:env FREELANCHE_STOREPASS -keypass:env FREELANCHE_STOREPASS >/dev/null
chmod 600 "$KEYSTORE_PATH"

umask 077
{
  echo "# Written by scripts/create-upload-key.sh. SECRET — never commit, share or paste this file (it is git-ignored)."
  echo "storeFile=$KEYSTORE_PATH"
  echo "storePassword=$PASSWORD"
  echo "keyAlias=$KEY_ALIAS"
  echo "keyPassword=$PASSWORD"
  echo "# Public, not secret: paste the licence key from Play Console (Monetize with Play > Monetization setup > Licensing)."
  echo "playLicenseKey="
} >"$PROPS_PATH"
chmod 600 "$PROPS_PATH"

FINGERPRINT="$(keytool -list -keystore "$KEYSTORE_PATH" -alias "$KEY_ALIAS" -storepass:env FREELANCHE_STOREPASS 2>/dev/null | sed -n 's/^.*(SHA-256): *//p;s/^Certificate fingerprint (SHA-256): *//p' | head -1)"
unset FREELANCHE_STOREPASS PASSWORD

echo
echo "Done."
echo "  Key file:       $KEYSTORE_PATH"
echo "  Build settings: $PROPS_PATH   (already git-ignored)"
echo "  Fingerprint (SHA-256, safe to share): ${FINGERPRINT:-unavailable}"
echo
echo "NEXT:"
echo "  1. Back up the .jks file and write its password in your password manager. Losing them means asking Google to reset the upload key."
echo "  2. In Play Console copy the licence key into $PROPS_PATH after 'playLicenseKey='."
echo "  3. Build with:  npm run android:bundle   (or let GitHub build it: docs/PLAY_CONSOLE_CHECKLIST.md, Part F)"
echo "     For GitHub, the same password goes into BOTH secrets UPLOAD_STORE_PASSWORD and UPLOAD_KEY_PASSWORD."
