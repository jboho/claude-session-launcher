#!/usr/bin/env bash
#
# Build a signed (and, if credentials are present, notarized + stapled) macOS
# bundle of Claude Launcher.
#
# Secrets never live in the repo. The Developer ID identity is discovered from
# your keychain at build time, and notarization credentials are read from a
# gitignored `.env.signing` (see `.env.signing.example`). With no credentials
# present this still produces a *signed* build — it just skips notarization.
#
#   scripts/build-signed.sh            # sign (+ notarize if creds present)
#   SIGN_ONLY=1 scripts/build-signed.sh # sign only, never notarize
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# --- notarization credentials (gitignored) --------------------------------
if [[ -f .env.signing ]]; then
  # shellcheck disable=SC1091
  set -a; source .env.signing; set +a
fi

# --- signing identity ------------------------------------------------------
# Respect an explicit APPLE_SIGNING_IDENTITY; otherwise auto-detect the single
# "Developer ID Application" identity in the login keychain.
if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  APPLE_SIGNING_IDENTITY="$(security find-identity -v -p codesigning \
    | sed -n 's/.*"\(Developer ID Application: [^"]*\)".*/\1/p' | head -n1)"
fi
if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  echo "error: no 'Developer ID Application' identity found in the keychain, and" >&2
  echo "       APPLE_SIGNING_IDENTITY is unset. Import the cert or set the var." >&2
  exit 1
fi
export APPLE_SIGNING_IDENTITY
echo "==> signing identity: ${APPLE_SIGNING_IDENTITY}"

# --- notarization method: auto-detect from what's in the environment -------
# Tauri notarizes during `tauri build` when it sees either credential set.
# Preference: App Store Connect API key (CI-friendly, non-expiring, revocable)
# over an app-specific password.
NOTARIZE_MODE="none"
if [[ "${SIGN_ONLY:-0}" == "1" ]]; then
  NOTARIZE_MODE="skipped (SIGN_ONLY=1)"
elif [[ -n "${APPLE_API_KEY:-}" && -n "${APPLE_API_ISSUER:-}" && -n "${APPLE_API_KEY_PATH:-}" ]]; then
  export APPLE_API_KEY APPLE_API_ISSUER APPLE_API_KEY_PATH
  NOTARIZE_MODE="api-key (${APPLE_API_KEY})"
elif [[ -n "${APPLE_ID:-}" && -n "${APPLE_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
  export APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID
  NOTARIZE_MODE="apple-id (${APPLE_ID})"
fi
echo "==> notarization: ${NOTARIZE_MODE}"
if [[ "${NOTARIZE_MODE}" == "none" ]]; then
  echo "    (no notary credentials in .env.signing — build will be signed but NOT notarized)"
fi

# --- build -----------------------------------------------------------------
echo "==> building…"
command pnpm tauri:build

# --- locate artifacts ------------------------------------------------------
APP="$(/usr/bin/find src-tauri/target/release/bundle/macos -maxdepth 1 -name '*.app' | head -n1)"
DMG="$(/usr/bin/find src-tauri/target/release/bundle/dmg -maxdepth 1 -name '*.dmg' | head -n1)"
if [[ -z "$APP" ]]; then echo "error: no .app produced" >&2; exit 1; fi

# --- notarize the DMG container --------------------------------------------
# Tauri notarizes and staples the .app, then builds the DMG *around* it, so the
# DMG itself never receives a ticket. A DOWNLOADED DMG then trips Gatekeeper even
# though the .app inside is notarized. Submit and staple the DMG separately.
if [[ -n "$DMG" && "$NOTARIZE_MODE" != "none" && "$NOTARIZE_MODE" != skipped* ]]; then
  echo ""
  echo "==> notarizing the DMG: $DMG"
  if [[ -n "${APPLE_API_KEY:-}" ]]; then
    xcrun notarytool submit "$DMG" --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER" --wait
  else
    xcrun notarytool submit "$DMG" --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" --wait
  fi
  xcrun stapler staple "$DMG"
fi

# --- verify ----------------------------------------------------------------
echo ""
echo "==> verifying signature: $APP"
codesign --verify --deep --strict --verbose=2 "$APP"
# Hardened runtime is required for notarization; expect flags to include 0x10000(runtime).
codesign -dvvv "$APP" 2>&1 | grep -E 'Authority=Developer ID Application|flags=|TeamIdentifier=' || true

echo ""
echo "==> Gatekeeper assessment (spctl): $APP"
if spctl -a -vvv -t exec "$APP" 2>&1; then
  echo "    -> accepted"
else
  echo "    -> rejected (expected until the build is NOTARIZED)"
fi

if [[ -n "$DMG" ]]; then
  echo ""
  echo "==> verifying DMG (the downloaded artifact): $DMG"
  codesign --verify --strict "$DMG" 2>&1 && echo "    signature valid" || echo "    DMG unsigned/invalid"
  # Assess the DMG itself as Gatekeeper does on open — not just the .app inside it. A
  # notarized+stapled DMG validates offline; before notarization this is 'rejected', same
  # as the app. (`-t open` + primary-signature context is the DMG-appropriate assessment.)
  if spctl -a -t open --context context:primary-signature -vvv "$DMG" 2>&1; then
    echo "    -> accepted"
  else
    echo "    -> rejected (expected until the build is NOTARIZED + stapled)"
  fi
fi

if [[ "$NOTARIZE_MODE" != "none" && "$NOTARIZE_MODE" != skipped* ]]; then
  echo ""
  echo "==> notarization staple:"
  xcrun stapler validate "$APP" || echo "    staple missing/invalid"
  [[ -n "$DMG" ]] && { echo "==> staple (dmg): $DMG"; xcrun stapler validate "$DMG" || echo "    dmg not stapled"; }
fi

echo ""
echo "==> done."
echo "    app: $APP"
[[ -n "$DMG" ]] && echo "    dmg: $DMG"
