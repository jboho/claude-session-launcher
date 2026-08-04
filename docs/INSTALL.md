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

> **Gatekeeper.** Signed builds are not yet **notarized**, so a DMG you *download*
> still trips the "unidentified developer" warning — macOS only clears that for
> notarized apps. Until notarization is enabled, either right-click → **Open**, or
> clear the quarantine flag once:
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

```bash
command pnpm install
command pnpm dist:mac        # fast: unpacked .app -> release/mac-arm64/
command pnpm dist:mac:dmg    # full DMG -> release/Claude-Launcher-<version>-<arch>.dmg
```

Signing happens automatically when a `Developer ID Application` certificate is present in
the keychain. To verify a build:

```bash
codesign -dvvv "release/mac-arm64/Claude Launcher.app"   # expect flags=0x10000(runtime)
codesign --verify --deep --strict "release/mac-arm64/Claude Launcher.app"
```

To build **unsigned** (what CI does), set `CSC_IDENTITY_AUTO_DISCOVERY=false`.

### Entitlements

`build/entitlements.mac.plist` is deliberately minimal — `allow-jit` and
`allow-unsigned-executable-memory` for V8, plus `automation.apple-events` for the
terminal integration. `disable-library-validation` (electron-builder's default) is **not**
included; the app has no native runtime dependencies and was verified to launch without it.

## Releasing (maintainers)

Releases are built by GitHub Actions (`.github/workflows/release.yml`) on a version tag:

```bash
# bump the version in package.json first (e.g. 0.1.0 -> 0.2.0), commit it, then:
git tag v0.2.0
git push origin v0.2.0
```

CI builds an **unsigned** macOS DMG (`CSC_IDENTITY_AUTO_DISCOVERY=false`) and uploads it to
a GitHub Release. Signing in CI would require exporting the Developer ID cert as a
base64 `CSC_LINK` secret plus `CSC_KEY_PASSWORD`; not set up yet.

Every PR and push to `main` also runs the build + test gate (`.github/workflows/ci.yml`).
