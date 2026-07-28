# Installing Claude Launcher (macOS)

Internal, unsigned builds. macOS only for now.

## Install

1. Download the latest **`Claude-Launcher-<version>-<arch>.dmg`** from the
   [Releases page](https://github.com/jboho/claude-session-launcher/releases).
   (`arm64` for Apple Silicon; `x64` for Intel.)
2. Open the DMG and drag **Claude Launcher** into **Applications**.
3. **First launch — get past Gatekeeper.** The build isn't code-signed yet, so macOS
   will warn about an "unidentified developer." Either:
   - **Right-click** the app in Applications → **Open** → **Open** in the dialog, or
   - clear the quarantine flag once:
     ```bash
     xattr -dr com.apple.quarantine "/Applications/Claude Launcher.app"
     ```

After that it launches normally. The app lives in the menu bar (look for the bolt) and
the Dock; press **⌥W** (Option+W, the default hotkey) to summon the panel.

> Code signing + Apple notarization (which removes the Gatekeeper prompt) and auto-update
> are planned but not in this build.

## Releasing (maintainers)

Releases are built by GitHub Actions (`.github/workflows/release.yml`) on a version tag:

```bash
# bump the version in package.json first (e.g. 0.1.0 -> 0.2.0), commit it, then:
git tag v0.2.0
git push origin v0.2.0
```

CI builds an **unsigned macOS DMG** and uploads it to a GitHub Release for that tag.

Every PR and push to `main` also runs the build + test gate (`.github/workflows/ci.yml`).

To build a DMG locally for testing (no publish):

```bash
pnpm dist:mac:dmg     # -> release/Claude-Launcher-<version>-<arch>.dmg
pnpm dist:mac         # faster: unpacked .app only (release/mac-arm64/)
```
