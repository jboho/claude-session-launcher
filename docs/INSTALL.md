# Installing Claude Launcher (macOS)

Internal builds, macOS only for now. Builds are **code-signed** with a Developer ID
certificate (Team `72FBK9YTA3`) and run under the hardened runtime.

## Install

1. Download the latest **`Claude-Launcher-<version>-<arch>.dmg`** from the
   [Releases page](https://github.com/jboho/claude-session-launcher/releases).
   (`arm64` for Apple Silicon; `x64` for Intel.)
2. Open the DMG and drag **Claude Launcher** into **Applications**.
3. Launch it. The app lives in the menu bar (look for the bolt); press **⌥W**
   (Option+W, the default hotkey) to summon the panel.

> **Gatekeeper.** A **notarized** DMG opens cleanly. If you have a build that was signed
> but *not* notarized, a downloaded copy trips the "unidentified developer" warning —
> either right-click → **Open**, or clear the quarantine flag once:
> ```bash
> xattr -dr com.apple.quarantine "/Applications/Claude Launcher.app"
> ```
> A **locally built** `.app` carries no quarantine flag and opens with no prompt at all.

## First launch: terminal permission

The launcher drives your terminal through Apple Events, so macOS asks once:

> "Claude Launcher" wants to control "iTerm".

Click **OK**. This is a TCC consent gate — it cannot be pre-approved or bypassed by
signing, and it is separate from Gatekeeper. If you click "Don't Allow", re-enable it
under **System Settings → Privacy & Security → Automation → Claude Launcher**.

Because builds are signed with a stable identity, this grant **persists across
rebuilds and upgrades**. Unsigned builds get a fresh code identity every time, which is
why they re-prompted on every install.

## Building locally

The app is built with **Tauri** (Rust core + WKWebView). Both bundle targets — the
`.app` and a `.dmg` — land under `src-tauri/target/release/bundle/`.

```bash
command pnpm install
command pnpm tauri:build          # ad-hoc signed (no Developer ID needed)
command pnpm tauri:build:signed   # Developer ID signed (+ notarized if creds present)
```

`tauri:build` with no signing identity produces an **ad-hoc** build — fine to run on the
machine that built it, but Gatekeeper rejects it elsewhere. `tauri:build:signed`
(`scripts/build-signed.sh`) auto-discovers your single `Developer ID Application`
certificate from the keychain — nothing personal is committed to the repo — and verifies
the result. To verify by hand:

```bash
APP="src-tauri/target/release/bundle/macos/Claude Launcher.app"
codesign -dvvv "$APP"                    # expect flags=0x10000(runtime), Authority=Developer ID Application
codesign --verify --deep --strict "$APP"
spctl -a -vvv -t exec "$APP"             # 'accepted' once notarized; 'rejected/Unnotarized' before
```

### Notarization

`tauri:build:signed` notarizes and staples automatically **when notary credentials are
present** in a gitignored `.env.signing` (copy `.env.signing.example` and fill in one
method — an App Store Connect API key is recommended). With no credentials it still
produces a signed build and just skips notarization. Notarization is what flips a
*downloaded* DMG from the "unidentified developer" warning to opening cleanly; signing
alone only stabilizes the app's code identity (see the TCC note above).

### Entitlements

`src-tauri/entitlements.plist` is deliberately minimal — only
`com.apple.security.automation.apple-events`, for the terminal integration. Tauri applies
the hardened runtime automatically when signing with a Developer ID (no JIT / unsigned-memory
entitlements are needed — unlike the former Electron build, there is no bundled V8).

## Releasing (maintainers)

Releases are built by GitHub Actions (`.github/workflows/release.yml`) on a version tag:

```bash
# bump the version in package.json AND src-tauri/tauri.conf.json first
# (e.g. 0.1.0 -> 0.2.0), commit it, then:
git tag v0.2.0
git push origin v0.2.0
```

`release.yml` runs on a macOS runner and attaches the resulting DMG to the GitHub Release for
that tag. It's **signed + notarized when the repo has these Actions secrets configured**
(**Settings → Secrets and variables → Actions**); with any of them missing it falls back to
an **unsigned** build, which trips Gatekeeper on a downloaded copy.

| Secret | Value |
|---|---|
| `APPLE_CERTIFICATE_P12_BASE64` | Your `Developer ID Application` cert, exported from Keychain Access as a `.p12` (File → Export Items, set an export password), then `base64 -i cert.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | The export password you set above |
| `CI_KEYCHAIN_PASSWORD` | Any random string — password for the throwaway keychain CI creates and deletes per run |
| `APPLE_API_KEY_P8_BASE64` | Your App Store Connect API key's `.p8` file, `base64 -i AuthKey_XXXXXXXXXX.p8 \| pbcopy` (same key `.env.signing`'s `APPLE_API_KEY_PATH` points at locally) |
| `APPLE_API_KEY_ID` | The 10-char Key ID from the `.p8` filename / the API key's row at [appstoreconnect.apple.com/access/integrations/api](https://appstoreconnect.apple.com/access/integrations/api) |
| `APPLE_API_ISSUER` | The Issuer ID (UUID) shown on that same page |

CI imports the cert into a throwaway keychain and decodes the API key, then runs
`scripts/build-signed.sh` — the same script local signed builds use, so CI and local builds
share one code path. Never commit any of the values above; they exist only as encrypted
repo secrets.

Without those secrets, cut a **signed + notarized** artifact locally instead:
`pnpm tauri:build:signed` (with `.env.signing` populated), then upload the DMG from
`src-tauri/target/release/bundle/dmg/` to the release by hand.
