# Launcher Generality (Roadmap #3) Implementation Plan

> **Execution:** hand off to the `run-plan` skill to implement this task-by-task (fresh subagent per task + spec/quality review). Steps use `- [ ]` checkboxes for tracking.

**Goal:** Remove the launcher's hardcoded assumptions (bare `claude`, fixed model list, fixed terminals, fixed hotkey) so any teammate can install it and have it work against their own setup without editing source.

**Architecture:** Incremental, in-place. Add three optional `Settings` fields (`claudeBinary`, `models`, `hotkey`) that migrate silently via the existing `{ ...DEFAULT_SETTINGS, ...parsed }` merge. New logic goes into small pure modules (`core/claude-binary.ts`, `core/accelerator.ts`, `main/hotkey.ts`, `main/detect.ts`) following the repo's pure-builder + thin-execFile-wrapper split, then gets wired through IPC/preload into `main.ts` and the renderer. Detection is advisory and never blocks launching.

**Tech stack:** Electron 33, TypeScript (NodeNext ESM, `"type":"module"`), Vitest. Package manager: `pnpm` (use `command pnpm` — the user's `pnpm-safe` shell wrapper misbehaves non-interactively).

**Spec:** `docs/specs/2026-07-23-launcher-generality-design.md`

**Conventions:**
- Run a single test file with: `command pnpm exec vitest run <path>`
- ESM imports use `.js` extensions on relative paths (NodeNext), even for `.ts` sources.
- Renderer files (`src/renderer/*`) have **no test harness** in this repo — those tasks are non-TDD with explicit manual verification via `command pnpm start`. Pure logic used by the renderer (accelerator parsing, model validation) lives in `core/` and IS tested.

---

## Task 1: Extend the Settings schema

**Files:**
- Modify: `src/core/types.ts:52-58`
- Modify (fix existing expectations): `src/core/types.test.ts:15-17`, `src/core/settings.test.ts:23-34`
- Modify (type literals gain required fields): `src/main/spawn/index.test.ts:6`

- [ ] **Step 1: Update the failing tests first**

In `src/core/types.test.ts`, replace the `default settings` test (lines 15-17):

```ts
  test("default settings target iTerm with no dir/cmd and empty generality fields", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      terminal: "iTerm", wd: "", cmd: "", claudeBinary: "", models: [], hotkey: "",
    });
  });
```

In `src/core/settings.test.ts`, replace the two literals that spell out a full `Settings` (lines 23-34):

```ts
  test("partial file merges over defaults", async () => {
    const f = await tmpFile();
    await fs.writeFile(f, JSON.stringify({ wd: "~/Code" }), "utf8");
    expect(await loadSettings(f)).toEqual({
      terminal: "iTerm", wd: "~/Code", cmd: "", claudeBinary: "", models: [], hotkey: "",
    });
  });

  test("save then load round-trips", async () => {
    const f = await tmpFile();
    const s = {
      terminal: "Terminal", wd: "/tmp", cmd: "/pr-queue",
      claudeBinary: "/usr/local/bin/claude", models: [{ value: "fable", label: "Fable" }], hotkey: "Control+Alt+C",
    };
    await saveSettings(s, f);
    expect(await loadSettings(f)).toEqual(s);
  });
```

In `src/main/spawn/index.test.ts`, update the shared `settings` literal (line 6):

```ts
const settings: Settings = { terminal: "iTerm", wd: "", cmd: "", claudeBinary: "", models: [], hotkey: "" };
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `command pnpm exec vitest run src/core/types.test.ts src/core/settings.test.ts`
Expected: FAIL — type errors / `DEFAULT_SETTINGS` missing `claudeBinary` etc.

- [ ] **Step 3: Extend the interface and defaults**

In `src/core/types.ts`, replace the `Settings` interface and `DEFAULT_SETTINGS` (lines 52-58):

```ts
export interface Settings {
  terminal: string; // "iTerm" | "Terminal" | "Ghostty" (macOS)
  wd: string; // default working directory for ad-hoc launches
  cmd: string; // default initial command for ad-hoc launches
  claudeBinary: string; // "" = use bare `claude` on PATH; else an explicit path
  models: Option[]; // [] / absent = built-in MODELS
  hotkey: string; // "" / absent = default "Alt+W"
}

export const DEFAULT_SETTINGS: Settings = {
  terminal: "iTerm", wd: "", cmd: "", claudeBinary: "", models: [], hotkey: "",
};
```

- [ ] **Step 4: Run the full suite, verify it passes**

Run: `command pnpm test`
Expected: PASS (all files green).

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/core/types.test.ts src/core/settings.test.ts src/main/spawn/index.test.ts
git commit -m "feat: add claudeBinary/models/hotkey settings fields (backward-compatible)"
```

---

## Task 2: Model capabilities + effective model list

**Files:**
- Modify: `src/core/types.ts` (append after `isHaiku`/`HAIKU_BLOCKED_MODES`, around line 28)
- Modify: `src/core/types.test.ts` (append a new describe block)

- [ ] **Step 1: Write the failing tests**

Append to `src/core/types.test.ts` (also add `capabilitiesFor, effectiveModels` to the import on line 2):

```ts
describe("capabilitiesFor", () => {
  test("haiku alias: no effort, auto blocked", () => {
    expect(capabilitiesFor("haiku")).toEqual({ effort: false, blockedModes: ["auto"] });
  });
  test("dated haiku id is still restricted", () => {
    expect(capabilitiesFor("claude-haiku-4-5-20251001")).toEqual({ effort: false, blockedModes: ["auto"] });
  });
  test("opus/sonnet/custom are unrestricted", () => {
    expect(capabilitiesFor("opus")).toEqual({ effort: true, blockedModes: [] });
    expect(capabilitiesFor("claude-sonnet-4-5-20250929")).toEqual({ effort: true, blockedModes: [] });
    expect(capabilitiesFor("some-future-model")).toEqual({ effort: true, blockedModes: [] });
  });
});

describe("effectiveModels", () => {
  test("empty or non-array falls back to built-in MODELS", () => {
    expect(effectiveModels([])).toBe(MODELS);
    expect(effectiveModels(undefined)).toBe(MODELS);
    expect(effectiveModels("nope" as unknown as never)).toBe(MODELS);
  });
  test("non-empty custom list is returned as-is", () => {
    const custom = [{ value: "fable", label: "Fable" }];
    expect(effectiveModels(custom)).toBe(custom);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `command pnpm exec vitest run src/core/types.test.ts`
Expected: FAIL — `capabilitiesFor is not defined`.

- [ ] **Step 3: Implement the functions**

In `src/core/types.ts`, add after the `HAIKU_BLOCKED_MODES` declaration (after line 28):

```ts
export interface ModelCapabilities {
  effort: boolean; // model supports --effort
  blockedModes: string[]; // permission modes the model rejects
}

/** Capabilities for a model value. Known families are restricted; unknown models are unrestricted. */
export function capabilitiesFor(model: string): ModelCapabilities {
  if (isHaiku(model)) return { effort: false, blockedModes: HAIKU_BLOCKED_MODES };
  return { effort: true, blockedModes: [] };
}

/** The model list to show: the user's configured list, or the built-in defaults when empty/invalid. */
export function effectiveModels(models: Option[] | undefined): Option[] {
  return Array.isArray(models) && models.length > 0 ? models : MODELS;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `command pnpm exec vitest run src/core/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/core/types.test.ts
git commit -m "feat: generalize model capability rules (unknown models unrestricted)"
```

---

## Task 3: `resolveClaudeCommand` + `buildDetectArgv`

**Files:**
- Create: `src/core/claude-binary.ts`
- Create: `src/core/claude-binary.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/core/claude-binary.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { resolveClaudeCommand, buildDetectArgv } from "./claude-binary.js";

describe("resolveClaudeCommand", () => {
  test("blank -> bare claude", () => {
    expect(resolveClaudeCommand("")).toBe("claude");
    expect(resolveClaudeCommand("   ")).toBe("claude");
  });
  test("a path is single-quoted (handles spaces)", () => {
    expect(resolveClaudeCommand("/opt/my tools/claude")).toBe("'/opt/my tools/claude'");
  });
});

describe("buildDetectArgv", () => {
  test("uses the given login shell", () => {
    expect(buildDetectArgv("/bin/bash")).toEqual(["/bin/bash", "-lc", "command -v claude"]);
  });
  test("falls back to /bin/zsh when shell is blank/undefined", () => {
    expect(buildDetectArgv(undefined)).toEqual(["/bin/zsh", "-lc", "command -v claude"]);
    expect(buildDetectArgv("")).toEqual(["/bin/zsh", "-lc", "command -v claude"]);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `command pnpm exec vitest run src/core/claude-binary.test.ts`
Expected: FAIL — cannot find module `./claude-binary.js`.

- [ ] **Step 3: Implement the module**

Create `src/core/claude-binary.ts`:

```ts
import { shellQuote } from "./launch-string.js";

/** The token to use in place of `claude` in the launch string: a quoted path, or bare `claude`. */
export function resolveClaudeCommand(binary: string): string {
  const b = binary.trim();
  return b ? shellQuote(b) : "claude";
}

/** Login-shell argv that reports the claude path if present — matches the terminal's PATH. */
export function buildDetectArgv(shell?: string): string[] {
  const sh = shell && shell.trim() ? shell : "/bin/zsh";
  return [sh, "-lc", "command -v claude"];
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `command pnpm exec vitest run src/core/claude-binary.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/claude-binary.ts src/core/claude-binary.test.ts
git commit -m "feat: resolveClaudeCommand + login-shell detect argv"
```

---

## Task 4: `buildLaunchString` accepts a claude-command token

**Files:**
- Modify: `src/core/launch-string.ts:9-17`
- Modify: `src/core/launch-string.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/core/launch-string.test.ts` inside the `buildLaunchString` describe:

```ts
  test("uses a supplied claude command token in place of bare claude", () => {
    expect(buildLaunchString(spec({ model: "opus", wd: "~/Code" }), "'/opt/tools/claude'"))
      .toBe("cd '~/Code' && '/opt/tools/claude' --model opus");
  });

  test("defaults to bare claude when no token is given", () => {
    expect(buildLaunchString(spec({ model: "sonnet" }))).toBe("claude --model sonnet");
  });
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `command pnpm exec vitest run src/core/launch-string.test.ts`
Expected: FAIL — second arg ignored; first assertion still shows `claude`.

- [ ] **Step 3: Implement**

Replace `buildLaunchString` in `src/core/launch-string.ts` (lines 9-17):

```ts
/** Build the shell command written into the terminal to start the session. */
export function buildLaunchString(spec: LaunchSpec, claudeCmd = "claude"): string {
  const parts = [claudeCmd];
  if (spec.model.trim()) parts.push("--model", spec.model.trim());
  if (spec.mode.trim()) parts.push("--permission-mode", spec.mode.trim());
  if (spec.effort.trim()) parts.push("--effort", spec.effort.trim());
  if (spec.cmd.trim()) parts.push(shellQuote(spec.cmd.trim()));
  const claudeInvocation = parts.join(" ");
  return spec.wd.trim() ? `cd ${shellQuote(spec.wd.trim())} && ${claudeInvocation}` : claudeInvocation;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `command pnpm exec vitest run src/core/launch-string.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/launch-string.ts src/core/launch-string.test.ts
git commit -m "feat: buildLaunchString accepts a claude command token"
```

---

## Task 5: Wire the resolved binary into `launchSpec`

**Files:**
- Modify: `src/main/spawn/index.ts:1-2,31-33`
- Modify: `src/main/spawn/index.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/main/spawn/index.test.ts` inside the `launchSpec` describe:

```ts
  test("uses the configured claude binary path (quoted) in the launch string", async () => {
    const launchMac = vi.fn().mockResolvedValue(undefined);
    const withBinary: Settings = { ...settings, claudeBinary: "/opt/my tools/claude" };
    const ok: LaunchSpec = { ...spec, wd: "", cmd: "" };
    await launchSpec(ok, withBinary, { platform: "darwin", launchMac });
    expect(launchMac).toHaveBeenCalledWith(
      "'/opt/my tools/claude' --model opus --permission-mode auto --effort high",
      "iTerm",
    );
  });
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `command pnpm exec vitest run src/main/spawn/index.test.ts`
Expected: FAIL — launch string still starts with bare `claude`.

- [ ] **Step 3: Implement**

In `src/main/spawn/index.ts`, add the import (after line 2):

```ts
import { resolveClaudeCommand } from "../../core/claude-binary.js";
```

Replace the launch-string construction (currently line 32):

```ts
  const launchString = buildLaunchString(spec, resolveClaudeCommand(settings.claudeBinary));
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `command pnpm exec vitest run src/main/spawn/index.test.ts`
Expected: PASS (existing tests still green — default `claudeBinary: ""` → bare `claude`).

- [ ] **Step 5: Commit**

```bash
git add src/main/spawn/index.ts src/main/spawn/index.test.ts
git commit -m "feat: launch with the configured claude binary when set"
```

---

## Task 6: Model-value validator (shared)

**Files:**
- Modify: `src/core/validate.ts` (append)
- Modify: `src/core/validate.test.ts` (append; create the file if it only tested presets — it exists)

- [ ] **Step 1: Write the failing test**

Append to `src/core/validate.test.ts` (add `isValidModelValue` to the import from `./validate.js`):

```ts
describe("isValidModelValue", () => {
  test("accepts aliases and dated ids", () => {
    expect(isValidModelValue("opus")).toBe(true);
    expect(isValidModelValue("claude-sonnet-4-5-20250929")).toBe(true);
    expect(isValidModelValue("fable")).toBe(true);
  });
  test("rejects empty and shell-metacharacter values", () => {
    expect(isValidModelValue("")).toBe(false);
    expect(isValidModelValue("   ")).toBe(false);
    expect(isValidModelValue("opus; rm -rf ~")).toBe(false);
    expect(isValidModelValue("opus[1m]")).toBe(false); // brackets deferred (see spec)
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `command pnpm exec vitest run src/core/validate.test.ts`
Expected: FAIL — `isValidModelValue is not defined`.

- [ ] **Step 3: Implement**

Append to `src/core/validate.ts`:

```ts
/**
 * A model value is written UNQUOTED into the launch string, so it must stay within a
 * shell-safe charset. Mirrors the launch dispatcher's SAFE_DIAL but requires non-empty.
 * (Bracket context-variants like `opus[1m]` are intentionally rejected — see spec: they
 * would need the model token quoted, which is deferred.)
 */
export const MODEL_VALUE_RE = /^[A-Za-z0-9._-]+$/;

export function isValidModelValue(value: string): boolean {
  return MODEL_VALUE_RE.test(value.trim());
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `command pnpm exec vitest run src/core/validate.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/validate.ts src/core/validate.test.ts
git commit -m "feat: shared model-value validator for the model editor"
```

---

## Task 7: `eventToAccelerator` (keyboard chord → Electron accelerator)

**Files:**
- Create: `src/core/accelerator.ts`
- Create: `src/core/accelerator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/core/accelerator.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { eventToAccelerator, type KeyEventLike } from "./accelerator.js";

const ev = (over: Partial<KeyEventLike>): KeyEventLike => ({
  altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, key: "", ...over,
});

describe("eventToAccelerator", () => {
  test("Alt+W", () => {
    expect(eventToAccelerator(ev({ altKey: true, key: "w" }))).toBe("Alt+W");
  });
  test("orders modifiers Control, Alt, Shift, Command", () => {
    expect(eventToAccelerator(ev({ ctrlKey: true, altKey: true, shiftKey: true, metaKey: true, key: "k" })))
      .toBe("Control+Alt+Shift+Command+K");
  });
  test("named keys map to Electron names", () => {
    expect(eventToAccelerator(ev({ metaKey: true, key: "ArrowUp" }))).toBe("Command+Up");
    expect(eventToAccelerator(ev({ ctrlKey: true, key: " " }))).toBe("Control+Space");
    expect(eventToAccelerator(ev({ altKey: true, key: "F5" }))).toBe("Alt+F5");
  });
  test("returns '' for a modifier alone or no modifier", () => {
    expect(eventToAccelerator(ev({ key: "Alt", altKey: true }))).toBe("");
    expect(eventToAccelerator(ev({ key: "a" }))).toBe("");
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `command pnpm exec vitest run src/core/accelerator.test.ts`
Expected: FAIL — cannot find module `./accelerator.js`.

- [ ] **Step 3: Implement**

Create `src/core/accelerator.ts`:

```ts
export interface KeyEventLike {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  key: string;
}

const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift"]);
const NAMED: Record<string, string> = {
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
  Escape: "Escape", Enter: "Return", Tab: "Tab", " ": "Space", Backspace: "Backspace", Delete: "Delete",
};

function normalizeKey(k: string): string {
  if (NAMED[k]) return NAMED[k];
  if (/^[a-z]$/.test(k)) return k.toUpperCase();
  if (/^[A-Z0-9]$/.test(k)) return k;
  if (/^F\d{1,2}$/.test(k)) return k;
  if (k.length === 1) return k; // punctuation
  return "";
}

/** Build an Electron accelerator string from a keydown event. Returns "" if not a valid chord. */
export function eventToAccelerator(e: KeyEventLike): string {
  if (MODIFIER_KEYS.has(e.key)) return ""; // a modifier pressed alone — keep waiting
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Control");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Command");
  if (mods.length === 0) return ""; // require at least one modifier
  const key = normalizeKey(e.key);
  return key ? [...mods, key].join("+") : "";
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `command pnpm exec vitest run src/core/accelerator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/accelerator.ts src/core/accelerator.test.ts
git commit -m "feat: keyboard chord to Electron accelerator parser"
```

---

## Task 8: `hotkeyCandidates` (registration fallback order)

**Files:**
- Create: `src/main/hotkey.ts`
- Create: `src/main/hotkey.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/hotkey.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { hotkeyCandidates, DEFAULT_HOTKEY } from "./hotkey.js";

describe("hotkeyCandidates", () => {
  test("blank preferred -> just the default", () => {
    expect(hotkeyCandidates("")).toEqual([DEFAULT_HOTKEY]);
    expect(hotkeyCandidates("   ")).toEqual([DEFAULT_HOTKEY]);
  });
  test("custom preferred first, then default", () => {
    expect(hotkeyCandidates("Control+Alt+C")).toEqual(["Control+Alt+C", DEFAULT_HOTKEY]);
  });
  test("de-duplicates when preferred equals the default", () => {
    expect(hotkeyCandidates("Alt+W")).toEqual(["Alt+W"]);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `command pnpm exec vitest run src/main/hotkey.test.ts`
Expected: FAIL — cannot find module `./hotkey.js`.

- [ ] **Step 3: Implement**

Create `src/main/hotkey.ts`:

```ts
export const DEFAULT_HOTKEY = "Alt+W"; // Option+W on macOS

/** Registration order: the preferred hotkey (if any) first, then the default, de-duplicated. */
export function hotkeyCandidates(preferred: string): string[] {
  const list = [preferred?.trim(), DEFAULT_HOTKEY].filter((h): h is string => !!h);
  return [...new Set(list)];
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `command pnpm exec vitest run src/main/hotkey.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/hotkey.ts src/main/hotkey.test.ts
git commit -m "feat: hotkey candidate fallback ordering"
```

---

## Task 9: Detection wrappers (`main/detect.ts`)

**Files:**
- Create: `src/main/detect.ts`
- Create: `src/main/detect.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/detect.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";
import { detectClaude, detectTerminals, TERMINAL_CANDIDATES } from "./detect.js";

describe("detectClaude", () => {
  test("found when the shell prints a path", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: "/Users/me/.local/bin/claude\n" });
    expect(await detectClaude("/bin/zsh", exec)).toEqual({ found: true, path: "/Users/me/.local/bin/claude" });
    expect(exec).toHaveBeenCalledWith("/bin/zsh", ["-lc", "command -v claude"]);
  });
  test("not found when output is empty", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: "\n" });
    expect(await detectClaude("/bin/zsh", exec)).toEqual({ found: false });
  });
  test("not found (never throws) when the shell errors", async () => {
    const exec = vi.fn().mockRejectedValue(new Error("exit 1"));
    expect(await detectClaude("/bin/zsh", exec)).toEqual({ found: false });
  });
});

describe("detectTerminals", () => {
  test("Terminal is always present; others gated on `open -Ra` success", async () => {
    const exec = vi.fn().mockImplementation((_cmd: string, args: string[]) =>
      args[1] === "iTerm" ? Promise.resolve({ stdout: "" }) : Promise.reject(new Error("not installed")),
    );
    const found = await detectTerminals(exec);
    expect(found).toContain("Terminal");
    expect(found).toContain("iTerm");
    expect(found).not.toContain("Ghostty");
  });
  test("candidate list is iTerm, Terminal, Ghostty", () => {
    expect(TERMINAL_CANDIDATES).toEqual(["iTerm", "Terminal", "Ghostty"]);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `command pnpm exec vitest run src/main/detect.test.ts`
Expected: FAIL — cannot find module `./detect.js`.

- [ ] **Step 3: Implement**

Create `src/main/detect.ts`:

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildDetectArgv } from "../core/claude-binary.js";

const execFileP = promisify(execFile);

export type Exec = (cmd: string, args: string[]) => Promise<{ stdout: string }>;
const defaultExec: Exec = (cmd, args) => execFileP(cmd, args);

export interface ClaudeDetectResult {
  found: boolean;
  path?: string;
}

/** Detect `claude` via a login shell (matches the terminal's PATH). Never throws. */
export async function detectClaude(
  shell: string | undefined = process.env.SHELL,
  exec: Exec = defaultExec,
): Promise<ClaudeDetectResult> {
  const [cmd, ...args] = buildDetectArgv(shell);
  try {
    const { stdout } = await exec(cmd, args);
    const path = stdout.trim().split("\n")[0]?.trim() ?? "";
    return path ? { found: true, path } : { found: false };
  } catch {
    return { found: false };
  }
}

/** macOS terminal candidates. Apple Terminal ships with the OS, so it is always present. */
export const TERMINAL_CANDIDATES = ["iTerm", "Terminal", "Ghostty"];

/** Return the installed subset of TERMINAL_CANDIDATES (probed via `open -Ra <name>`). */
export async function detectTerminals(exec: Exec = defaultExec): Promise<string[]> {
  const installed: string[] = [];
  for (const name of TERMINAL_CANDIDATES) {
    if (name === "Terminal") {
      installed.push(name);
      continue;
    }
    try {
      await exec("open", ["-Ra", name]);
      installed.push(name);
    } catch {
      /* not installed — skip */
    }
  }
  return installed;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `command pnpm exec vitest run src/main/detect.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/detect.ts src/main/detect.test.ts
git commit -m "feat: claude + terminal detection wrappers (advisory)"
```

---

## Task 10: IPC + preload wiring

Non-TDD (thin wiring; verified by build + the manual renderer checks in later tasks).

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/preload.ts`
- Modify: `src/renderer/panel.ts:16-28` (Window interface only)

- [ ] **Step 1: Add IPC handlers**

In `src/main/ipc.ts`, add the import (after line 5):

```ts
import { detectClaude, detectTerminals } from "./detect.js";
```

Change the `registerIpc` signature to accept a `setHotkey` dependency (main owns `globalShortcut`), and add three handlers. Give `deps` a no-op default so this task builds standalone before `main.ts` is wired in Task 11. Replace the function declaration line (`export function registerIpc(): void {`) with:

```ts
export function registerIpc(deps: { setHotkey: (accel: string) => boolean } = { setHotkey: () => false }): void {
```

Add inside the function body (e.g. after the `validate-workdir` handler):

```ts
  ipcMain.handle("claude:detect", () => detectClaude());
  ipcMain.handle("terminals:detect", () => detectTerminals());
  ipcMain.handle("hotkey:set", (_e, accel: string) => deps.setHotkey(accel));
```

- [ ] **Step 2: Expose the new calls in preload**

In `src/preload/preload.ts`, add inside the `exposeInMainWorld("launcher", { ... })` object:

```ts
  detectClaude: (): Promise<{ found: boolean; path?: string }> => ipcRenderer.invoke("claude:detect"),
  detectTerminals: (): Promise<string[]> => ipcRenderer.invoke("terminals:detect"),
  setHotkey: (accel: string): Promise<boolean> => ipcRenderer.invoke("hotkey:set", accel),
```

- [ ] **Step 3: Extend the renderer's Window type**

In `src/renderer/panel.ts`, add these three lines to the `launcher` interface (inside the `declare global` block, after `validateWorkdir`):

```ts
      detectClaude(): Promise<{ found: boolean; path?: string }>;
      detectTerminals(): Promise<string[]>;
      setHotkey(accel: string): Promise<boolean>;
```

- [ ] **Step 4: Verify it builds**

Run: `command pnpm build`
Expected: PASS — `tsc` compiles with no errors. `main.ts` still calls `registerIpc()` with no args, which resolves to the no-op `setHotkey` default; Task 11 replaces that call with the real dependency.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc.ts src/preload/preload.ts src/renderer/panel.ts
git commit -m "feat: IPC + preload for detection and hotkey control"
```

---

## Task 11: Configurable global hotkey in `main.ts`

Non-TDD (Electron `globalShortcut`; the pure ordering logic is covered by Task 8).

**Files:**
- Modify: `src/main/main.ts`

- [ ] **Step 1: Import settings loader + hotkey helper**

In `src/main/main.ts`, add after the existing imports (after line 5):

```ts
import { loadSettings } from "../core/settings.js";
import { hotkeyCandidates, DEFAULT_HOTKEY } from "./hotkey.js";
```

- [ ] **Step 2: Add a module-level active-hotkey + `setHotkey`**

Add near the other module-level `let` declarations (after line 19, `let panel`):

```ts
let activeHotkey = "";

/** (Re)register the global hotkey. Returns true iff the REQUESTED accelerator got it. */
function setHotkey(preferred: string): boolean {
  globalShortcut.unregisterAll();
  const wanted = preferred?.trim() || DEFAULT_HOTKEY;
  for (const hk of hotkeyCandidates(preferred)) {
    if (globalShortcut.register(hk, () => togglePanel())) {
      activeHotkey = hk;
      return hk === wanted;
    }
  }
  activeHotkey = "";
  return false;
}
```

- [ ] **Step 3: Register from settings at startup; pass `setHotkey` to IPC**

In the `app.whenReady().then(async () => { ... })` block:

- Change `registerIpc();` to `registerIpc({ setHotkey });`
- Replace the hardcoded hotkey block (current lines ~98-107, the `const HOTKEYS = ["Alt+W"]; ... console.log(...)`) with:

```ts
  // Global hotkey from settings, falling back to the default then to none.
  const startupSettings = await loadSettings();
  setHotkey(startupSettings.hotkey);
  console.log(`[launcher] global hotkey: ${activeHotkey || "NONE (all candidates were taken)"}`);
```

(`will-quit` already calls `globalShortcut.unregisterAll()` — leave it.)

- [ ] **Step 4: Build + smoke-launch**

Run: `command pnpm build` → Expected: PASS (no type errors).
Run: `command pnpm start` → Expected: app launches; console prints `[launcher] global hotkey: Alt+W`; pressing Option+W toggles the panel. Quit the app.

- [ ] **Step 5: Commit**

```bash
git add src/main/main.ts
git commit -m "feat: register the global hotkey from settings with fallback"
```

---

## Task 12: Renderer — "Claude not found" banner + binary path field

Non-TDD (renderer). Manual verification via `command pnpm start`.

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/panel.ts`
- Modify: `src/renderer/panel.css`

- [ ] **Step 1: Add the banner + a Settings field to the HTML**

In `src/renderer/index.html`, add the banner as the first child inside `<div class="win">` (before `.titlebar`, line 11):

```html
    <div class="banner" id="claude-banner">⚠ Claude Code not found on your PATH — <a href="https://code.claude.com/docs" target="_blank" rel="noreferrer">install it</a>, or set a path in ⚙ Settings.</div>
```

In the settings `.sheet`, add a field after the "Default working directory" `.sfld` (after line 43):

```html
      <div class="sfld"><label>Claude binary (optional)</label><input id="s-claude" type="text" placeholder="claude (auto-detected on PATH)" /></div>
```

- [ ] **Step 2: Style the banner**

Append to `src/renderer/panel.css`:

```css
  /* Claude-not-found banner (hidden unless not-detected AND no override) */
  .banner { display:none; margin:0 0 10px; padding:8px 10px; border-radius:9px;
    background:var(--accent-weak); color:var(--accent); font-size:11px; line-height:1.3;
    border:1px solid var(--accent); }
  .banner.show { display:block; }
  .banner a { color:var(--accent); font-weight:700; }
```

- [ ] **Step 3: Wire the field + detection in `panel.ts`**

Add a helper (near `renderTerminalSeg`, before `init`):

```ts
async function refreshClaudeStatus(): Promise<void> {
  let found = false;
  try {
    found = (await window.launcher.detectClaude()).found;
  } catch {
    found = false;
  }
  const show = !found && !settings.claudeBinary.trim();
  $("claude-banner").classList.toggle("show", show);
}
```

In `syncInputs()`, add the binary field:

```ts
  ($("s-claude") as HTMLInputElement).value = settings.claudeBinary;
```

In `init()`, add an input handler (alongside the `s-wd` handler) and re-check status when Settings closes:

```ts
  ($("s-claude") as HTMLInputElement).oninput = () => {
    settings.claudeBinary = ($("s-claude") as HTMLInputElement).value;
  };
```

In the `close-settings` click handler and the `backdrop` click handler, after `void window.launcher.saveSettings(settings);` add:

```ts
    void refreshClaudeStatus();
```

At the end of `init()` (after `syncInputs()`), add:

```ts
  void refreshClaudeStatus();
```

- [ ] **Step 4: Manual verification**

Run: `command pnpm start`
- With `claude` on PATH: no banner appears. Open ⚙, confirm the "Claude binary" field renders (blank).
- Simulate not-found: temporarily rename the binary or set `CLAUDE_LAUNCHER_CONFIG` to a settings file, quit, and relaunch from a context without `claude` on PATH → banner shows. Setting a path in the field + Done → banner hides on close.
- Confirm a launch still works (bare `claude` when field blank).

Report what you observed (banner shown/hidden states).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/index.html src/renderer/panel.ts src/renderer/panel.css
git commit -m "feat: not-found banner + claude binary path setting"
```

---

## Task 13: Renderer — configurable model list (editor + dials)

Non-TDD (renderer). Manual verification via `command pnpm start`.

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/panel.ts`
- Modify: `src/renderer/panel.css`

- [ ] **Step 1: Add the model editor container to the HTML**

In the settings `.sheet`, add after the Terminal `.sfld` (after line 42):

```html
      <div class="sfld"><label>Models</label><div class="model-editor" id="model-editor"></div><button class="add-model" id="add-model">＋ Add model</button></div>
```

- [ ] **Step 2: Style the editor**

Append to `src/renderer/panel.css`:

```css
  /* Model editor rows in Settings */
  .model-editor { display:flex; flex-direction:column; gap:6px; }
  .model-row { display:flex; gap:6px; align-items:center; }
  .model-row input { flex:1; padding:6px 8px; border:1px solid var(--border); border-radius:7px;
    background:var(--panel-2); color:var(--text); font:inherit; font-size:12px; }
  .model-row input.invalid { border-color:#c4314b; outline:1px solid #c4314b; }
  .model-row .rm { flex:0 0 auto; width:28px; height:30px; border:1px solid var(--border);
    background:transparent; color:var(--muted); border-radius:7px; cursor:pointer; }
  .model-row .rm:hover { color:#c4314b; border-color:#c4314b; }
  .add-model { margin-top:7px; align-self:flex-start; padding:5px 10px; border:1px dashed var(--border);
    background:transparent; color:var(--accent); border-radius:7px; cursor:pointer; font:inherit; font-size:12px; }
```

- [ ] **Step 3: Refactor dials to use `capabilitiesFor` + `effectiveModels`**

In `src/renderer/panel.ts`, update the import from `../core/types.js`: add `capabilitiesFor, effectiveModels`, and drop `isHaiku, HAIKU_BLOCKED_MODES, MODELS` (all three become unused after this refactor — `currentModels()` obtains the built-in fallback via `effectiveModels`). Also import the validator:

```ts
import { isValidModelValue } from "../core/validate.js";
```

Replace `renderDials()` (lines 56-88) with:

```ts
function currentModels(): { value: string; label: string }[] {
  return effectiveModels(settings.models);
}

function renderDials(): void {
  const caps = capabilitiesFor(sel.model);
  if (!caps.effort) sel.effort = "";
  if (caps.blockedModes.includes(sel.mode)) sel.mode = "";
  const groups: [string, { value: string; label: string }[], "model" | "mode" | "effort"][] = [
    ["g-model", currentModels(), "model"],
    ["g-mode", MODES, "mode"],
    ["g-effort", EFFORTS, "effort"],
  ];
  for (const [elId, options, key] of groups) {
    const host = $(elId);
    host.innerHTML = "";
    for (const o of options) {
      const disabled =
        (key === "effort" && !caps.effort) || (key === "mode" && caps.blockedModes.includes(o.value));
      host.appendChild(
        sqBtn(
          o.label,
          sel[key] === o.value,
          () => {
            sel[key] = sel[key] === o.value ? "" : o.value;
            renderDials();
            renderPreview();
          },
          disabled,
        ),
      );
    }
  }
}
```

- [ ] **Step 4: Add the editor render + apply logic**

Add (near `renderTerminalSeg`):

```ts
function renderModelEditor(): void {
  const host = $("model-editor");
  host.innerHTML = "";
  currentModels().forEach((m, i) => {
    const row = document.createElement("div");
    row.className = "model-row";
    const val = document.createElement("input");
    val.value = m.value;
    val.placeholder = "value (e.g. opus)";
    const lab = document.createElement("input");
    lab.value = m.label;
    lab.placeholder = "label";
    const rm = document.createElement("button");
    rm.className = "rm";
    rm.textContent = "✕";
    rm.title = "Remove model";
    val.onchange = () => applyModels();
    lab.onchange = () => applyModels();
    rm.onclick = () => {
      const next = currentModels().slice();
      next.splice(i, 1);
      settings.models = next; // may become [] -> effectiveModels falls back to built-ins
      persistModels();
    };
    row.append(val, lab, rm);
    host.appendChild(row);
  });
}

function applyModels(): void {
  const rows = Array.from($("model-editor").querySelectorAll(".model-row"));
  const next: { value: string; label: string }[] = [];
  let bad = false;
  for (const row of rows) {
    const [valEl, labEl] = row.querySelectorAll("input");
    const value = (valEl as HTMLInputElement).value.trim();
    const label = (labEl as HTMLInputElement).value.trim() || value;
    const ok = isValidModelValue(value);
    (valEl as HTMLInputElement).classList.toggle("invalid", !ok);
    if (!ok) { bad = true; continue; }
    next.push({ value, label });
  }
  if (bad) { toast("Model value must be letters/digits/._- (no spaces or brackets)"); return; }
  settings.models = next;
  persistModels();
}

function persistModels(): void {
  void window.launcher.saveSettings(settings);
  renderModelEditor();
  renderDials();
  renderPreview();
}
```

Wire the "Add model" button and open-render in `init()`:

- In the `open-settings` click handler, add `renderModelEditor();`
- Add:

```ts
  $("add-model").onclick = () => {
    settings.models = [...currentModels(), { value: "", label: "" }];
    renderModelEditor();
  };
```

- [ ] **Step 5: Manual verification, then commit**

Run: `command pnpm start`
- Open ⚙ → the model editor lists opus/sonnet/haiku (built-in defaults).
- Add a row `fable` / `Fable` → close & reopen the panel → Model dials now include Fable, and Fable (unknown) shows Effort + all modes enabled.
- Add a dated id `claude-haiku-4-5-20251001` / `Haiku (pinned)` → selecting it greys out Effort + Auto (family rule still applies).
- Enter an invalid value (`opus[1m]` or `a b`) → the field goes red + toast; not saved.
- Delete all rows → dials fall back to built-in opus/sonnet/haiku.

Report what you observed.

```bash
git add src/renderer/index.html src/renderer/panel.ts src/renderer/panel.css
git commit -m "feat: user-configurable model list with capability-aware dials"
```

---

## Task 14: Renderer — show only installed terminals

Non-TDD (renderer). Manual verification via `command pnpm start`.

**Files:**
- Modify: `src/renderer/panel.ts`

- [ ] **Step 1: Replace the hardcoded terminal list with detection**

In `src/renderer/panel.ts`:

- Remove the module constant `const TERMINALS = ["iTerm", "Terminal", "Ghostty"];` (line 30) and replace with:

```ts
let availableTerminals: string[] = ["Terminal"]; // filled by detection; Terminal always present
```

- Replace `renderTerminalSeg()` (lines 149-161) with:

```ts
function renderTerminalSeg(): void {
  const seg = $("seg-terminal");
  seg.innerHTML = "";
  if (!availableTerminals.includes(settings.terminal)) {
    settings.terminal = availableTerminals.includes("Terminal") ? "Terminal" : availableTerminals[0] ?? "Terminal";
  }
  for (const t of availableTerminals) {
    seg.appendChild(
      sqBtn(t, settings.terminal === t, () => {
        settings.terminal = t;
        renderTerminalSeg();
        void window.launcher.saveSettings(settings);
      }),
    );
  }
}
```

- In `init()`, before the first `renderTerminalSeg()` call (or right after loading settings), fetch the detected list:

```ts
  try {
    availableTerminals = await window.launcher.detectTerminals();
    if (availableTerminals.length === 0) availableTerminals = ["Terminal"];
  } catch {
    availableTerminals = ["Terminal"];
  }
```

- [ ] **Step 2: Manual verification**

Run: `command pnpm start`
- Open ⚙ → the Terminal segment shows only terminals actually installed (e.g. iTerm + Terminal if Ghostty isn't installed).
- If a previously-saved terminal is no longer installed, the selection falls back to Terminal.

Report the terminals shown on this machine.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/panel.ts
git commit -m "feat: show only installed terminals"
```

---

## Task 15: Renderer — hotkey recorder

Non-TDD (renderer; chord parsing covered by Task 7). Manual verification via `command pnpm start`.

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/panel.ts`
- Modify: `src/renderer/panel.css`

- [ ] **Step 1: Add the recorder to the HTML**

In the settings `.sheet`, add after the Claude binary `.sfld`:

```html
      <div class="sfld"><label>Global hotkey</label><div class="hk-row"><button class="hk-rec" id="hotkey-rec">Alt+W</button><button class="hk-reset" id="hotkey-reset">Reset</button></div></div>
```

- [ ] **Step 2: Style it**

Append to `src/renderer/panel.css`:

```css
  /* Hotkey recorder */
  .hk-row { display:flex; gap:6px; }
  .hk-rec { flex:1; padding:7px 9px; border:1px solid var(--border); border-radius:8px;
    background:var(--panel-2); color:var(--text); font:inherit; font-size:12.5px; cursor:pointer; text-align:left; }
  .hk-rec.recording { border-color:var(--accent); color:var(--accent); font-style:italic; }
  .hk-reset { flex:0 0 auto; padding:7px 11px; border:1px solid var(--border); border-radius:8px;
    background:transparent; color:var(--muted); font:inherit; font-size:12px; cursor:pointer; }
  .hk-reset:hover { border-color:var(--accent); color:var(--accent); }
```

- [ ] **Step 3: Wire the recorder in `panel.ts`**

Add the import:

```ts
import { eventToAccelerator } from "../core/accelerator.js";
```

Add a setup function (near the other renderers):

```ts
function initHotkeyRecorder(): void {
  const rec = $("hotkey-rec") as HTMLButtonElement;
  const render = (): void => { rec.textContent = settings.hotkey || "Alt+W"; };
  render();
  rec.onclick = () => {
    rec.classList.add("recording");
    rec.textContent = "Press a shortcut…";
    const onKey = async (e: KeyboardEvent): Promise<void> => {
      e.preventDefault();
      const accel = eventToAccelerator(e);
      if (!accel) return; // wait for a full chord (modifier + key)
      window.removeEventListener("keydown", onKey, true);
      rec.classList.remove("recording");
      const ok = await window.launcher.setHotkey(accel);
      if (ok) {
        settings.hotkey = accel;
        void window.launcher.saveSettings(settings);
        toast(`Hotkey set to ${accel}`);
      } else {
        toast(`Hotkey unavailable — still using ${settings.hotkey || "Alt+W"}`);
      }
      render();
    };
    window.addEventListener("keydown", onKey, true);
  };
  ($("hotkey-reset") as HTMLButtonElement).onclick = async () => {
    const ok = await window.launcher.setHotkey("Alt+W");
    settings.hotkey = "";
    void window.launcher.saveSettings(settings);
    render();
    toast(ok ? "Hotkey reset to Alt+W" : "Alt+W unavailable");
  };
}
```

Call `initHotkeyRecorder();` once at the end of `init()`.

- [ ] **Step 4: Manual verification**

Run: `command pnpm start`
- Open ⚙ → recorder shows `Alt+W`.
- Click it → "Press a shortcut…" → press `Control+Alt+C` → toast "Hotkey set to Control+Alt+C"; pressing Control+Alt+C now toggles the panel; Option+W no longer does.
- Click Reset → back to Alt+W; Option+W toggles again.
- Try a known-taken combo (e.g. `Command+Space`) → toast "Hotkey unavailable — still using …" and the prior hotkey keeps working.
- Quit + relaunch → the saved custom hotkey is registered at startup (check console line).

Report the behaviors observed.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/index.html src/renderer/panel.ts src/renderer/panel.css
git commit -m "feat: configurable global hotkey recorder in Settings"
```

---

## Task 16: Full suite + docs

**Files:**
- Modify: `ROADMAP.md`
- Modify: `README.md`

- [ ] **Step 1: Run the whole test suite**

Run: `command pnpm test`
Expected: PASS — all files green.

- [ ] **Step 2: Update the ROADMAP**

In `ROADMAP.md`, move the bucket "#3 — Make it work for anyone (generality)" items into the **Done** section (check them off), noting the deferred model-version granularity and `[1m]` support (unquoted-token limitation). Leave #4 and #2 untouched.

- [ ] **Step 3: Update the README**

In `README.md`, update "Platform support (v1)" and Config sections to reflect: `claude` auto-detected (with an optional binary-path override), only installed terminals shown, configurable model list, and a configurable global hotkey (default Option+W).

- [ ] **Step 4: Commit**

```bash
git add ROADMAP.md README.md
git commit -m "docs: mark generality (#3) done; note deferred model granularity"
```

---

## Self-review — spec coverage map

| Spec requirement | Task(s) |
| --- | --- |
| New optional Settings fields (`claudeBinary`, `models`, `hotkey`); backward-compatible merge | 1 |
| Login-shell claude detection (avoids GUI PATH gotcha); never blocks launch | 3 (argv), 9 (wrapper), 12 (banner) |
| Optional binary override used (quoted) in the launch string | 3, 4, 5 |
| "Claude not found" banner (only when not found AND no override) + Settings path field | 12 |
| Terminal detection — show only installed | 9, 14 |
| Configurable model list; effective-list fallback to built-ins | 1, 2, 13 |
| Capability table generalized; unknown model = unrestricted; dated haiku still restricted | 2, 13 |
| Model-value validation (charset; `[1m]` rejected — deferred) | 6, 13 |
| Configurable hotkey: startup registration w/ fallback + runtime re-register + failure feedback | 7, 8, 10, 11, 15 |
| Chord → Electron accelerator parsing | 7 |
| Tests follow pure-builder + thin-wrapper split | 2, 3, 6, 7, 8, 9 |
| Deferred: model-version UI granularity + `[1m]` bracket support | Noted in Task 6 / Task 16 |
