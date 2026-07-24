# Claude Launcher — Generality (Roadmap #3) — Design

**Date:** 2026-07-23
**Status:** Draft (for review)
**Scope:** ROADMAP bucket **#3 — Make it work for anyone**. Follow-on buckets (#4 Distribution, #2 Windows) are out of scope here and get their own spec → plan → implement cycles.

## Goal

v1 works on the author's Mac but hardcodes assumptions that break for anyone else:
the model list, the terminal list, the global hotkey, and the bare `claude`
invocation. This bucket removes those assumptions so a teammate can install the app
and have it work against *their* setup, without editing source.

## Current state (what this builds on)

- Launching writes a **shell string** into a login-shell terminal
  (`claude …`, or `cd '<wd>' && claude …`), built by `core/launch-string.ts`.
  `claude` therefore resolves against the **terminal's** PATH, not the app's.
- Model capability rules are hardcoded and value-keyed in `core/types.ts`
  (`isHaiku`, `HAIKU_BLOCKED_MODES`); dials grey out in `renderer/panel.ts`.
- Terminals (`TERMINALS`) and the hotkey (`Alt+W`) are hardcoded in
  `renderer/panel.ts` and `main/main.ts`.
- `core/settings.ts` loads with `{ ...DEFAULT_SETTINGS, ...parsed }`, so adding
  optional fields is backward-compatible — old `settings.json` files migrate silently.
- The pure-core + thin-execFile-wrapper split (e.g. `spawn/macos.ts`: pure
  `buildMacScript` vs. `launchMac` wrapper) keeps logic unit-testable without spawning.

## Approach

Incremental, in-place: extend the existing modules and add two small focused
modules. No architectural rewrite. Everything hangs off three new **optional**
`Settings` fields:

```ts
interface Settings {
  terminal: string; wd: string; cmd: string;   // existing
  claudeBinary: string;   // "" = bare `claude` on PATH
  models: Option[];       // [] / absent = built-in MODELS
  hotkey: string;         // "" / absent = "Alt+W"
}
```

`DEFAULT_SETTINGS` gains `claudeBinary: ""`, `models: []`, `hotkey: ""`.

---

## Feature 1 — Detect `claude` + optional binary override

**Decision (confirmed):** login-shell detection + optional override.

- **New pure module `core/claude-binary.ts`**
  - `resolveClaudeCommand(binary: string): string` → `shellQuote(binary)` when set,
    else `"claude"`.
  - `buildDetectArgv(shell?: string): string[]` → the login-shell argv that checks
    presence (e.g. `[shell ?? "/bin/zsh", "-lc", "command -v claude"]`).
- **`buildLaunchString(spec, claudeCmd = "claude")`** gains a second parameter so the
  resolved token replaces the hardcoded `"claude"`. Default keeps existing behavior.
- **`spawn/index.ts` (`launchSpec`)** passes `resolveClaudeCommand(settings.claudeBinary)`.
  The binary path is treated like `wd`/`cmd` — single-quoted, **not** charset-restricted
  (it legitimately holds spaces/slashes).
- **Detection (main, IPC `claude:detect`)** runs `buildDetectArgv($SHELL || /bin/zsh)`
  via `execFile`, returns `{ found: boolean, path?: string }`. Uses a **login shell** so
  it sees the same PATH the terminal will — sidestepping the macOS GUI truncated-PATH
  gotcha. Any failure/timeout ⇒ `{ found: false }`. **Detection never blocks launching.**
- **UI**
  - Settings: a "Claude binary" text field, placeholder `claude (auto-detected on PATH)`.
  - A slim banner at the **top of the panel**, shown **only** when not found *and* no
    override is set: `⚠ Claude Code not found — [install]` linking to install guidance.

## Feature 2 — Detect installed terminals

- **Main (IPC `terminals:detect`)** probes each candidate with `open -Ra <app>` (exit 0
  = installed). Apple Terminal is always present on macOS. Returns the installed subset.
  macOS-only for now; structured so a Windows probe plugs in behind the same IPC later.
- **UI:** `renderTerminalSeg` renders the detected subset instead of the hardcoded
  `TERMINALS`. If the saved terminal isn't in the detected set, fall back to Terminal
  and toast.

## Feature 3 — Configurable model list

**Decision (confirmed):** built-in capability table + unknown model = unrestricted.

- **Effective list** = `settings.models` when non-empty, else built-in `MODELS`.
  Deleting all rows falls back to the built-ins (never an empty picker).
- **Capabilities:** generalize `isHaiku` / `HAIKU_BLOCKED_MODES` into
  `capabilitiesFor(value): { effort: boolean; blockedModes: string[] }`, keyed by known
  family (haiku → `{ effort: false, blockedModes: ["auto"] }`). **Unknown/custom models
  ⇒ unrestricted** (all dials enabled). `renderDials` uses this instead of the hardcoded
  Haiku check. The existing `startsWith("claude-haiku")` check means dated haiku IDs are
  still recognized as restricted.
- **UI:** editable rows in Settings — `[value] [label] [✕]` + "＋ Add model". On save,
  the dials re-render from the effective list.
- **Validation:** client-side format sanity only (see caveat below). Claude Code does
  **not** validate `--model` at launch (a typo fails on the first request with "There's
  an issue with the selected model"), so the launcher cannot confirm a model actually
  exists — the user owns correctness of custom IDs. This reinforces "unknown ⇒ unrestricted."

### Model version pinning — capability noted, granularity DEFERRED

Claude Code's `--model` accepts more than the three aliases, and the model list is meant
to be able to hold these values:

- **Full model IDs**, including **dated snapshots** for version pinning — e.g.
  `claude-opus-4-8`, `claude-sonnet-4-5-20250929`. (Docs: "to pin to a specific version,
  use the full model name.")
- **Context variants** like `opus[1m]` / `sonnet[1m]`.
- Also-valid aliases beyond opus/sonnet/haiku/fable: `best`, `default`, `opusplan`.

Source: https://code.claude.com/docs/en/model-config.md

**This is possible and intended to be supported at the value level** — a user can type a
pinned/dated ID or a custom alias into a model row. **How granular the UI gets is
explicitly deferred** (e.g. a per-family version dropdown, a dedicated "pin version"
affordance, or surfacing `[1m]` as a toggle). We don't yet know how far to take it.

- **Initial implementation:** the model row is a free-text value field; any alias or
  `claude-…` ID is accepted as-is. No version-specific UI.
- **Parked technical caveat (gates `[1m]` support):** model/mode/effort are written
  **unquoted** into the shell string today, guarded by `/^[A-Za-z0-9._-]*$/`. `[1m]`
  contains shell glob metacharacters `[` `]`, so the bracket variants are **not accepted
  under the current charset**. Unlocking them is a small, isolated change — **shell-quote
  the model token** (strictly safer than unquoted+charset) instead of restricting the
  charset. Deferred with the granularity question; dated `claude-…` IDs need no such change.

## Feature 4 — Configurable global hotkey

**Default choice (open at review):** a **recorder** input (recommended over a plain
text field).

- **Startup (main):** register `[settings.hotkey, "Alt+W"]` in order — a taken/invalid
  custom hotkey falls back to the default, then to none (current behavior). `main.ts`
  loads settings in the async `whenReady` before registering.
- **Runtime change (IPC `hotkey:set`):** unregister old, register new; on failure
  (already taken) keep the old binding and return `false` ⇒ renderer toasts
  "Hotkey unavailable — still using `<old>`".
- **UI:** a recorder input in Settings — click, press a chord, it captures an Electron
  accelerator (require ≥1 modifier + a key), with a "reset to default (Alt+W)" affordance.
  - *Fallback if the recorder isn't wanted:* a plain text field where the user types an
    Electron accelerator string. Less friendly, more typo-prone.

---

## Error handling

- Detection failures (execFile throws / times out) ⇒ treated as "not found"; advisory
  only, never block launching.
- Hotkey registration failure ⇒ keep the previous binding, toast.
- Invalid model value ⇒ rejected in the UI, not saved.
- All new settings fields are optional with defaults ⇒ old configs load unchanged.

## Testing (Vitest, matching existing style)

Pure units, no real spawn required:

- `resolveClaudeCommand` — set ⇒ quoted path; unset ⇒ `claude`.
- `buildLaunchString` with a custom command token.
- `buildDetectArgv` — shape/shell fallback.
- `capabilitiesFor` — haiku (dated + alias) restricted; unknown unrestricted.
- Model-value validation (charset while unquoted).
- Settings migration — missing new fields ⇒ defaults.
- Terminal-probe result mapping (pure builder over injected probe results).

Thin execFile wrappers (detection, terminal probe, launch) keep the existing pure-builder
split so logic is tested without spawning.

## UI note

The Settings overlay gains a few rows (binary path, model editor, hotkey recorder) and
becomes vertically scrollable.

---

## Decisions & open items

**Decided:**
- Feature 1: login-shell detection + optional override.
- Feature 3: built-in capability table + unknown = unrestricted.

**Defaults chosen here, open to change at review:**
- Feature 4 hotkey UX: recorder input (vs. plain text field).
- New settings (`claudeBinary`, `models`, `hotkey`) live in `settings.json` (single
  config, backward-compatible merge) rather than a separate file.
- Not-found banner: top of panel, shown only when not found *and* no override.

**Explicitly deferred:**
- How granular model-version pinning gets in the UI (per-family version dropdown /
  "pin version" affordance / surfacing `[1m]`). Initial pass: free-text value only.
- `[1m]` bracket-variant support (requires quoting the model token). Parked with the
  granularity question.

## Non-goals (separate buckets)

- Distribution: remote repo, CI, app icon, auto-update (#4).
- Windows support: spawner, Windows-safe quoting, `.ico` tray, Windows hotkey (#2).
