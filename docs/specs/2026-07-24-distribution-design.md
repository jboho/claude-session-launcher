# Claude Launcher — Distribution (Roadmap #4) — Design

**Date:** 2026-07-24
**Status:** Approved — implementing directly (infra verified by running builds/CI, not TDD fan-out)
**Scope:** ROADMAP bucket **#4 — Distribution (internal)**, narrowed to what's buildable now: CI, a release artifact, the app/menu-bar icons, and an install doc. Unsigned, macOS-only.

## Goal

Turn the working local build into an installable, versioned artifact a teammate can download and run, produced automatically by CI — without code signing (deferred) or Windows (bucket #2).

## Constraints that shaped the scope

- **Auto-update needs code signing on macOS** (Squirrel.Mac won't update an unsigned app) → auto-update is **deferred** with signing.
- **Windows artifacts are premature** — the Windows spawner + launch-string quoting live in bucket #2 (not built); a Windows build would be non-functional → **macOS-only CI** now, structured to add Windows later.
- **Unsigned `.app` trips Gatekeeper** ("unidentified developer") → documented install workaround; no signing this pass.

## Current state (before this work)

- electron-builder config was minimal: `mac.target: "dir"` (raw unsigned `.app`), no icon, no publish. Script `dist:mac` = `electron-builder --mac --dir`.
- No `.github/workflows`. `pnpm-lock.yaml` **is** committed (CI can use `--frozen-lockfile`).
- Tray icon was a base64 data-URL baked into `main.ts`; no app icon.
- Artwork provided by the user (`~/Desktop/exports`): `claude-bolt-icon-1024.png` (orange rounded-square white bolt) and `menubar-bolt-black-44.png` (black-on-transparent bolt template).

## Design

### Icons (real artwork)
- **App icon:** `build/icon.png` = the 1024² bolt; electron-builder derives the `.icns`. Set `mac.icon`.
- **Menu-bar icon:** commit `assets/trayTemplate.png` (22²) + `assets/trayTemplate@2x.png` (44²) from the black bolt. `main.ts` loads it via `nativeImage.createFromPath` + `setTemplateImage(true)` (macOS tints for light/dark), replacing the inline data-URL. `copy-assets.mjs` copies `assets/` → `dist/assets/`; `dist/**` bundles it.

### electron-builder
- `mac.target` → `"dmg"` for releases (keep a `dist:mac` `--dir` script for fast local checks). `mac.icon: build/icon.png`. **Signing disabled** (`mac.identity: null` + CI env `CSC_IDENTITY_AUTO_DISCOVERY=false`) so CI doesn't fail hunting for certs. `artifactName` includes version.
- No `zip`/`latest-mac.yml` (those are for auto-update — deferred).

### CI (GitHub Actions)
- **`ci.yml`** — on PRs + pushes to `main`: pnpm (`pnpm/action-setup`) + Node 20 + cache → `pnpm install --frozen-lockfile` → `pnpm build` → `pnpm test`, on **ubuntu-latest** (pure-TS tests; fast/cheap). Merge gate.
- **`release.yml`** — on tag `v*`: **macos-latest** → install → build → `electron-builder --mac dmg --publish always` → unsigned DMG uploaded to a **GitHub Release** (`GITHUB_TOKEN`, `permissions: contents: write`, `CSC_IDENTITY_AUTO_DISCOVERY: false`).

### Docs
- `docs/INSTALL.md` (+ README pointer): download DMG from Releases → drag to Applications → clear Gatekeeper quarantine (`xattr -dr com.apple.quarantine "/Applications/Claude Launcher.app"` or right-click→Open). Release flow: bump `version` → tag `vX.Y.Z` → push tag → CI publishes.

## Verification
- Local: `pnpm build` + `pnpm test` green; build the DMG locally (`electron-builder --mac dmg`) to confirm the icon + config — fallback to `--dir` if DMG tooling can't download in this environment, and rely on CI for the real DMG.
- CI: push the branch, open a PR, watch `ci.yml` go green; the release path is exercised when a `v*` tag is first pushed.

## Deferred (structured to slot in later)
- Windows CI artifacts (bucket #2).
- Code signing + Apple notarization.
- Auto-update (`electron-updater`; needs signing on macOS).

## Non-goals
- Windows support (#2); any product features (#3, shipped).
