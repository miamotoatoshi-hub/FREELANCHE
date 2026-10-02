#!/usr/bin/env bash
# Looks for things that must never be committed: private keys, service-account files, signing keystores, API secrets.
# Checks every file git knows about or would add. Exit code 1 if anything is found.
#   bash scripts/scan-secrets.sh
set -uo pipefail
cd "$(dirname "$0")/.."

# The patterns are assembled from pieces so that this file does not match itself.
BEGIN_="BEGIN"; KEY_="PRIVATE"" KEY"
PATTERN="${BEGIN_} ([A-Z]+ )*${KEY_}|\"private_""key\"|client_""secret|AIza[0-9A-Za-z_-]{35}|sk_li""ve_[0-9a-zA-Z]{20,}|AKIA[0-9A-Z]{16}|ghp_[0-9A-Za-z]{30,}"

FILES="$( (git ls-files; git ls-files --others --exclude-standard) | sort -u )"
found=0

hits="$(printf '%s\n' "$FILES" | xargs -d '\n' grep -IlE "$PATTERN" 2>/dev/null || true)"
if [ -n "$hits" ]; then echo "Possible secrets inside these files:"; echo "$hits"; found=1; fi

names="$(printf '%s\n' "$FILES" | grep -Ei '\.jks$|\.keystore$|keystore\.properties$|local\.properties$|service-account.*\.json$|google-services\.json$|\.p12$|\.pem$|\.env$' || true)"
if [ -n "$names" ]; then echo "Files that must not be committed:"; echo "$names"; found=1; fi

if [ "$found" -eq 0 ]; then echo "Secret scan: nothing suspicious found."; fi
exit "$found"
