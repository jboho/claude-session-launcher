# claude-session-launcher — Deployment, Release & Signing

Cold reference — read when building for release, signing, notarizing, or cutting a version. Extracted from CLAUDE.md 2026-09-12. Distribution = a **macOS DMG built by the Tauri bundler**. No servers.

## Pipeline

- **`ci.yml`** — on PRs + pushes to `main`: macOS runner (required — the Rust core uses macOS-only tray/window APIs and won't compile on Linux), pnpm 10.33 / Node 20 + Rust toolchain, `pnpm install --frozen-lockfile` → `pnpm build` → `pnpm test` → `cargo test --manifest-path src-tauri/Cargo.toml`. The merge gate, covering both the TS core and the Rust backend that owns launch-argument safety.
- **`release.yml`** — on a `v*` git tag: macOS runner → Rust toolchain → **signed + notarized** via `scripts/build-signed.sh` when the repo's signing secrets are set (imports the Developer ID cert into a throwaway keychain + decodes the App Store Connect API key; exact secret names in `docs/INSTALL.md` "Releasing (maintainers)"), else falls back to an unsigned `pnpm tauri:build`. DMG attached to the GitHub Release (`softprops/action-gh-release`, `contents: write`).
- **Local signed build:** `pnpm tauri:build:signed` (`scripts/build-signed.sh`) — signs with the Developer ID auto-discovered from the keychain and, if `.env.signing` holds notary credentials, notarizes + staples both the `.app` and the `.dmg`, then verifies. Artifacts under `src-tauri/target/release/bundle/{macos,dmg}/`.

## Release flow

Bump `version` in **both** `package.json` and `src-tauri/tauri.conf.json` → commit → `git tag vX.Y.Z && git push origin vX.Y.Z` → CI publishes the unsigned DMG. For a signed + notarized artifact, build locally with `tauri:build:signed` and upload that DMG. (No release cut yet; version `0.1.0`.)

## Install

Download the DMG → drag to Applications. See `docs/INSTALL.md`. A notarized DMG opens cleanly; an unsigned one trips Gatekeeper (right-click → Open, or `xattr -dr com.apple.quarantine`). A locally-built `.app` carries no quarantine flag.

## Code signing / notarization

Local builds sign via keychain auto-discovery of the `Developer ID Application: Jonathan Boho (72FBK9YTA3)` cert (valid to 2027-02-01); Tauri applies the hardened runtime automatically. Entitlements: `src-tauri/entitlements.plist` (minimal — only `com.apple.security.automation.apple-events`, for the terminal integration). Notary credentials live in a gitignored `.env.signing` (see `.env.signing.example`).

**Why signing matters here:** the app's Automation (Apple Events) TCC grant is keyed to the code signature. A stable Developer ID makes the "control iTerm" grant persist across rebuilds/upgrades; an unstable identity re-prompts every install. **Notarize the DMG separately** — Tauri notarizes + staples the `.app`, then builds the DMG *around* it, so the DMG itself gets no ticket and a *downloaded* DMG trips Gatekeeper; `build-signed.sh` submits + staples the DMG on its own after the Tauri build.

## Signing / release env vars

| Variable | Purpose |
|----------|---------|
| `APPLE_SIGNING_IDENTITY` | Override the auto-detected Developer ID identity for `build-signed.sh` |
| `APPLE_API_KEY` / `APPLE_API_ISSUER` / `APPLE_API_KEY_PATH` | App Store Connect API-key notarization (preferred); in gitignored `.env.signing` |
| `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` | App-specific-password notarization (fallback); in `.env.signing` |
| `GITHUB_TOKEN` | `softprops/action-gh-release` upload (Actions-provided in `release.yml`) |

## Infrastructure

None — desktop app. The only hosted surface is **GitHub Releases** (artifact host) and **GitHub Actions** (CI/release). No cloud accounts, databases, or services.
