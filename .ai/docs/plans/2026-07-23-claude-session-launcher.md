# Claude Session Launcher — Implementation Plan

> **Execution:** hand off to the `run-plan` skill to implement this task-by-task (fresh subagent per task + spec/quality review). Steps use `- [ ]` checkboxes for tracking.

**Goal:** A cross-platform menu-bar/tray widget that launches a `claude` CLI session in a terminal with model / permission-mode / effort (plus working-dir + initial command) preselected, and lets the user save named presets for one-click launch.

**Architecture:** Electron app in TypeScript. A tray icon toggles a compact frameless "widget" window (the panel). The panel is a button-grid composer (Model · Mode · Effort dials) + a saved-presets lane + a Settings overlay (terminal target, default working-dir, default initial-command). All launch/validation/config logic lives in **pure, Electron-free core modules** (unit-tested with Vitest); the Electron main process is a thin shell that spawns the terminal (macOS via `osascript`→iTerm for v1; Windows/Linux throw a clear "not implemented in v1"). Presets persist to a portable `presets.json`, settings to `settings.json`, both in a standard config dir.

**Tech stack:** Electron, TypeScript (NodeNext ESM), Vitest, pnpm. No UI framework (vanilla HTML/CSS/TS — YAGNI for a personal widget).

**Design reference:** `mockups/panel.html` (settled interactive mockup — the renderer's visual + interaction source of truth).

**Verified `claude` launch surface** (from `claude --help`):
- `--model <alias|id>` — aliases `opus`/`sonnet`/`fable`; full ids like `claude-haiku-4-5-20251001`.
- `--permission-mode <acceptEdits|auto|bypassPermissions|manual|plan>`.
- `--effort <low|medium|high|xhigh|max>`.
- Launch string shape: `cd '<wd>' && claude --model <m> --permission-mode <pm> --effort <e> '<initial-cmd>'` (each dial omitted when unset).
- **No `--fast` flag exists** — fast mode was dropped from scope entirely.

---

## File structure

```
claude-session-launcher/
  package.json                 # deps, scripts, electron main entry
  tsconfig.json                # NodeNext ESM, strict
  vitest.config.ts             # test runner config
  .gitignore
  README.md
  scripts/copy-assets.mjs      # copy renderer .html/.css into dist/
  .ai/docs/plans/2026-07-23-claude-session-launcher.md
  mockups/panel.html           # design reference (already exists)
  src/
    core/                      # PURE, no Electron, no Node-in-renderer-facing files
      types.ts                 # dial option lists, LaunchSpec, Preset, Settings, factories
      launch-string.ts         # shellQuote + buildLaunchString(spec)  [pure]
      validate.ts              # validatePreset(preset)                [pure]
      normalize.ts             # normalizePreset(raw)                  [pure]
      presets-store.ts         # config paths, load/save presets, directoryExists  [Node]
      settings.ts              # load/save settings                    [Node]
    main/
      preset-actions.ts        # upsert/remove preset (uses store)     [Node]
      spawn/
        macos.ts               # osaQuote, buildMacScript, launchMac   [Node]
        index.ts               # launchSpec(spec, settings)            [Node]
      ipc.ts                   # ipcMain handlers                      [Electron]
      main.ts                  # app entry: tray + panel window        [Electron]
    preload/
      preload.ts               # contextBridge API                     [Electron]
    renderer/
      index.html               # panel markup
      panel.css                # panel styles (from mockup)
      panel.ts                 # panel logic, wired to IPC             [browser + pure core]
```

**Purity rule (load-bearing):** `types.ts`, `launch-string.ts`, `validate.ts`, `normalize.ts` import **nothing** from Node or Electron, so the renderer can import them directly. Everything touching `fs`/`child_process` lives in `presets-store.ts`, `settings.ts`, `preset-actions.ts`, `spawn/*` and is main-process only.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `scripts/copy-assets.mjs`

This is scaffolding — no tests.

- [ ] **Step 1: Initialize the repo and directory structure**

```bash
cd ~/Code/claude-session-launcher
git init
mkdir -p src/core src/main/spawn src/preload src/renderer scripts
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "claude-session-launcher",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/main/main.js",
  "scripts": {
    "build": "tsc && node scripts/copy-assets.mjs",
    "start": "pnpm build && electron .",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "electron": "^33.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "declaration": false
  },
  "include": ["src"],
  "exclude": ["**/*.test.ts", "node_modules", "dist"]
}
```

- [ ] **Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 5: Write `scripts/copy-assets.mjs`**

```js
import { mkdir, cp } from "node:fs/promises";

await mkdir("dist/renderer", { recursive: true });
await cp("src/renderer/index.html", "dist/renderer/index.html");
await cp("src/renderer/panel.css", "dist/renderer/panel.css");
```

- [ ] **Step 6: Write `.gitignore`**

```
node_modules/
dist/
*.log
.DS_Store
```

- [ ] **Step 7: Install dependencies**

Run: `command pnpm install`
Expected: creates `node_modules/` + `pnpm-lock.yaml`; installs electron, typescript, vitest, @types/node. (Run with sandbox off if the network is blocked.)

- [ ] **Step 8: Commit and branch**

```bash
git add -A
git commit -m "chore: scaffold Electron + TS + Vitest project"
git branch -M main
git checkout -b feat/v1-panel-launcher
```

(All later task commits land on `feat/v1-panel-launcher`. Open a PR / merge to `main` at the end — see Task 13.)

---

### Task 2: Core types and option lists

**Files:**
- Create: `src/core/types.ts`
- Test: `src/core/types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "vitest";
import { MODELS, MODES, EFFORTS, DEFAULT_SETTINGS, emptyPreset } from "./types.js";

describe("types", () => {
  test("dial option lists have the expected counts", () => {
    expect(MODELS.map((o) => o.value)).toEqual(["opus", "sonnet", "haiku"]);
    expect(MODES.map((o) => o.value)).toEqual(["plan", "auto", "acceptEdits"]);
    expect(EFFORTS.map((o) => o.value)).toEqual(["low", "medium", "high", "xhigh", "max"]);
  });

  test("emptyPreset returns an all-blank preset", () => {
    expect(emptyPreset()).toEqual({ id: "", name: "", model: "", mode: "", effort: "", wd: "", cmd: "" });
  });

  test("default settings target iTerm with no dir/cmd", () => {
    expect(DEFAULT_SETTINGS).toEqual({ terminal: "iTerm", wd: "", cmd: "" });
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `command pnpm test src/core/types.test.ts`
Expected: FAIL — cannot find module `./types.js`.

- [ ] **Step 3: Write the implementation**

```ts
export interface Option {
  value: string;
  label: string;
}

export const MODELS: Option[] = [
  { value: "opus", label: "Opus" },
  { value: "sonnet", label: "Sonnet" },
  { value: "haiku", label: "Haiku" },
];

export const MODES: Option[] = [
  { value: "plan", label: "Plan" },
  { value: "auto", label: "Auto" },
  { value: "acceptEdits", label: "Accept" },
];

export const EFFORTS: Option[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Med" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "XHigh" },
  { value: "max", label: "Max" },
];

/** A single launchable configuration. "" for any dial = don't pass that flag. */
export interface LaunchSpec {
  model: string;
  mode: string;
  effort: string;
  wd: string;
  cmd: string;
}

export interface Preset extends LaunchSpec {
  id: string;
  name: string;
}

export interface Settings {
  terminal: string; // "iTerm" | "Terminal" (macOS)
  wd: string; // default working directory for ad-hoc launches
  cmd: string; // default initial command for ad-hoc launches
}

export const DEFAULT_SETTINGS: Settings = { terminal: "iTerm", wd: "", cmd: "" };

export function emptyPreset(): Preset {
  return { id: "", name: "", model: "", mode: "", effort: "", wd: "", cmd: "" };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `command pnpm test src/core/types.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/core/types.test.ts
git commit -m "feat: core types and dial option lists"
```

---

### Task 3: Launch-string builder

**Files:**
- Create: `src/core/launch-string.ts`
- Test: `src/core/launch-string.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "vitest";
import { buildLaunchString, shellQuote } from "./launch-string.js";
import type { LaunchSpec } from "./types.js";

const spec = (over: Partial<LaunchSpec> = {}): LaunchSpec => ({
  model: "", mode: "", effort: "", wd: "", cmd: "", ...over,
});

describe("shellQuote", () => {
  test("wraps in single quotes", () => {
    expect(shellQuote("/Users/me/Code")).toBe("'/Users/me/Code'");
  });
  test("escapes embedded single quotes", () => {
    expect(shellQuote("a'b")).toBe("'a'\\''b'");
  });
});

describe("buildLaunchString", () => {
  test("all dials empty -> bare claude", () => {
    expect(buildLaunchString(spec())).toBe("claude");
  });

  test("full spec assembles flags in order with cd", () => {
    expect(buildLaunchString(spec({ model: "opus", mode: "auto", effort: "high", wd: "~/Code", cmd: "/pr-queue" })))
      .toBe("cd '~/Code' && claude --model opus --permission-mode auto --effort high '/pr-queue'");
  });

  test("omits unset dials", () => {
    expect(buildLaunchString(spec({ model: "sonnet", effort: "low" })))
      .toBe("claude --model sonnet --effort low");
  });

  test("quotes a working directory containing spaces", () => {
    expect(buildLaunchString(spec({ model: "opus", wd: "/Users/me/My Code" })))
      .toBe("cd '/Users/me/My Code' && claude --model opus");
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `command pnpm test src/core/launch-string.test.ts`
Expected: FAIL — cannot find module `./launch-string.js`.

- [ ] **Step 3: Write the implementation**

```ts
import type { LaunchSpec } from "./types.js";

/** POSIX single-quote a string so the receiving shell treats it literally. */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Build the shell command written into the terminal to start the session. */
export function buildLaunchString(spec: LaunchSpec): string {
  const parts = ["claude"];
  if (spec.model.trim()) parts.push("--model", spec.model.trim());
  if (spec.mode.trim()) parts.push("--permission-mode", spec.mode.trim());
  if (spec.effort.trim()) parts.push("--effort", spec.effort.trim());
  if (spec.cmd.trim()) parts.push(shellQuote(spec.cmd.trim()));
  const claudeCmd = parts.join(" ");
  return spec.wd.trim() ? `cd ${shellQuote(spec.wd.trim())} && ${claudeCmd}` : claudeCmd;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `command pnpm test src/core/launch-string.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/launch-string.ts src/core/launch-string.test.ts
git commit -m "feat: pure launch-string builder"
```

---

### Task 4: Preset validation

**Files:**
- Create: `src/core/validate.ts`
- Test: `src/core/validate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "vitest";
import { validatePreset } from "./validate.js";
import { emptyPreset } from "./types.js";

const preset = (over = {}) => ({ ...emptyPreset(), ...over });

describe("validatePreset", () => {
  test("blank name is invalid", () => {
    const r = validatePreset(preset({ name: "   " }));
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("Name is required.");
  });

  test("named preset with empty dials is valid", () => {
    expect(validatePreset(preset({ name: "Plain" })).valid).toBe(true);
  });

  test("unknown mode is rejected", () => {
    const r = validatePreset(preset({ name: "x", mode: "nope" }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("mode"))).toBe(true);
  });

  test("unknown effort is rejected", () => {
    const r = validatePreset(preset({ name: "x", effort: "turbo" }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("effort"))).toBe(true);
  });

  test("known dial values pass", () => {
    expect(validatePreset(preset({ name: "x", model: "opus", mode: "auto", effort: "high" })).valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `command pnpm test src/core/validate.test.ts`
Expected: FAIL — cannot find module `./validate.js`.

- [ ] **Step 3: Write the implementation**

```ts
import { EFFORTS, MODES, type Preset } from "./types.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const values = (options: { value: string }[]): string[] => options.map((o) => o.value);

/**
 * Deterministic, fs-free validation. Model is intentionally NOT restricted
 * (aliases + arbitrary future ids are allowed); mode/effort must match a known
 * value when set, to catch corruption in a hand-edited presets.json.
 */
export function validatePreset(preset: Preset): ValidationResult {
  const errors: string[] = [];
  if (!preset.name.trim()) errors.push("Name is required.");
  if (preset.mode && !values(MODES).includes(preset.mode)) errors.push(`Unknown mode: ${preset.mode}`);
  if (preset.effort && !values(EFFORTS).includes(preset.effort)) errors.push(`Unknown effort: ${preset.effort}`);
  return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `command pnpm test src/core/validate.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/validate.ts src/core/validate.test.ts
git commit -m "feat: preset validation"
```

---

### Task 5: Preset normalization (boundary coercion)

**Files:**
- Create: `src/core/normalize.ts`
- Test: `src/core/normalize.test.ts`

This guards the data boundary: `presets.json` is hand-editable/portable, so raw parsed JSON must be coerced to a `Preset` (no blind casts).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "vitest";
import { normalizePreset } from "./normalize.js";

describe("normalizePreset", () => {
  test("fills missing fields with blanks", () => {
    expect(normalizePreset({ name: "X" })).toEqual({ id: "", name: "X", model: "", mode: "", effort: "", wd: "", cmd: "" });
  });

  test("coerces non-string / null / undefined to blank", () => {
    expect(normalizePreset({ name: 42, model: null, wd: undefined })).toEqual(
      { id: "", name: "", model: "", mode: "", effort: "", wd: "", cmd: "" },
    );
  });

  test("passes through a well-formed preset", () => {
    const p = { id: "a", name: "PR", model: "opus", mode: "auto", effort: "high", wd: "~/Code", cmd: "/pr-queue" };
    expect(normalizePreset(p)).toEqual(p);
  });

  test("null/garbage input yields a blank preset", () => {
    expect(normalizePreset(null)).toEqual({ id: "", name: "", model: "", mode: "", effort: "", wd: "", cmd: "" });
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `command pnpm test src/core/normalize.test.ts`
Expected: FAIL — cannot find module `./normalize.js`.

- [ ] **Step 3: Write the implementation**

```ts
import { emptyPreset, type Preset } from "./types.js";

export function normalizePreset(raw: unknown): Preset {
  const o = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  return {
    ...emptyPreset(),
    id: str(o.id),
    name: str(o.name),
    model: str(o.model),
    mode: str(o.mode),
    effort: str(o.effort),
    wd: str(o.wd),
    cmd: str(o.cmd),
  };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `command pnpm test src/core/normalize.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/normalize.ts src/core/normalize.test.ts
git commit -m "feat: preset normalization at the JSON boundary"
```

---

### Task 6: Presets store (config paths + load/save + dir check)

**Files:**
- Create: `src/core/presets-store.ts`
- Test: `src/core/presets-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, test } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { configDir, loadPresets, savePresets, directoryExists } from "./presets-store.js";

const tmpFiles: string[] = [];
async function tmpFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "csl-"));
  const f = path.join(dir, "presets.json");
  tmpFiles.push(f);
  return f;
}
afterEach(async () => { for (const f of tmpFiles.splice(0)) await fs.rm(path.dirname(f), { recursive: true, force: true }); });

describe("configDir", () => {
  test("honors CLAUDE_LAUNCHER_CONFIG override (returns its dir)", () => {
    expect(configDir({ CLAUDE_LAUNCHER_CONFIG: "/x/y/presets.json" }, "/home")).toBe("/x/y");
  });
  test("posix uses XDG_CONFIG_HOME when set", () => {
    expect(configDir({ XDG_CONFIG_HOME: "/cfg" }, "/home", "linux")).toBe("/cfg/claude-launcher");
  });
  test("posix falls back to ~/.config", () => {
    expect(configDir({}, "/home/me", "darwin")).toBe("/home/me/.config/claude-launcher");
  });
  test("win32 uses APPDATA", () => {
    expect(configDir({ APPDATA: "C:\\Users\\me\\AppData\\Roaming" }, "C:\\Users\\me", "win32"))
      .toBe(path.win32.join("C:\\Users\\me\\AppData\\Roaming", "claude-launcher"));
  });
});

describe("loadPresets / savePresets", () => {
  test("missing file returns empty array", async () => {
    const f = await tmpFile();
    await fs.rm(f, { force: true });
    expect(await loadPresets(f)).toEqual([]);
  });

  test("save then load round-trips", async () => {
    const f = await tmpFile();
    const p = { id: "1", name: "PR", model: "opus", mode: "auto", effort: "high", wd: "~/Code", cmd: "/pr-queue" };
    await savePresets([p], f);
    expect(await loadPresets(f)).toEqual([p]);
  });

  test("backfills a missing id on load", async () => {
    const f = await tmpFile();
    await fs.writeFile(f, JSON.stringify([{ name: "no-id" }]), "utf8");
    const loaded = await loadPresets(f);
    expect(loaded[0].id).not.toBe("");
    expect(loaded[0].name).toBe("no-id");
  });

  test("invalid JSON throws (no silent empty)", async () => {
    const f = await tmpFile();
    await fs.writeFile(f, "{ not json", "utf8");
    await expect(loadPresets(f)).rejects.toThrow(/not valid JSON/);
  });

  test("non-array JSON throws", async () => {
    const f = await tmpFile();
    await fs.writeFile(f, JSON.stringify({ nope: true }), "utf8");
    await expect(loadPresets(f)).rejects.toThrow(/array/);
  });
});

describe("directoryExists", () => {
  test("true for a real dir, false otherwise", async () => {
    expect(await directoryExists(os.tmpdir())).toBe(true);
    expect(await directoryExists(path.join(os.tmpdir(), "definitely-not-here-csl"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `command pnpm test src/core/presets-store.test.ts`
Expected: FAIL — cannot find module `./presets-store.js`.

- [ ] **Step 3: Write the implementation**

```ts
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
import { normalizePreset } from "./normalize.js";
import type { Preset } from "./types.js";

export function configDir(
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir(),
  platform: NodeJS.Platform = process.platform,
): string {
  if (env.CLAUDE_LAUNCHER_CONFIG) return path.dirname(env.CLAUDE_LAUNCHER_CONFIG);
  if (platform === "win32") {
    return path.join(env.APPDATA ?? path.join(home, "AppData", "Roaming"), "claude-launcher");
  }
  return path.join(env.XDG_CONFIG_HOME ?? path.join(home, ".config"), "claude-launcher");
}

export function presetsPath(env: NodeJS.ProcessEnv = process.env, home?: string): string {
  if (env.CLAUDE_LAUNCHER_CONFIG) return env.CLAUDE_LAUNCHER_CONFIG;
  return path.join(configDir(env, home), "presets.json");
}

export async function loadPresets(file: string = presetsPath()): Promise<Preset[]> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Presets file ${file} is not valid JSON.`);
  }
  if (!Array.isArray(parsed)) throw new Error(`Presets file ${file} must be a JSON array of presets.`);
  return parsed.map((r) => {
    const p = normalizePreset(r);
    if (!p.id) p.id = randomUUID();
    return p;
  });
}

export async function savePresets(presets: Preset[], file: string = presetsPath()): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(presets, null, 2), "utf8");
  await fs.rename(tmp, file);
}

export async function directoryExists(dir: string): Promise<boolean> {
  try {
    const st = await fs.stat(dir);
    return st.isDirectory();
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `command pnpm test src/core/presets-store.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/core/presets-store.ts src/core/presets-store.test.ts
git commit -m "feat: portable presets store with config-path resolution"
```

---

### Task 7: Settings store

**Files:**
- Create: `src/core/settings.ts`
- Test: `src/core/settings.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, test } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadSettings, saveSettings } from "./settings.js";
import { DEFAULT_SETTINGS } from "./types.js";

const dirs: string[] = [];
async function tmpFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "csl-set-"));
  dirs.push(dir);
  return path.join(dir, "settings.json");
}
afterEach(async () => { for (const d of dirs.splice(0)) await fs.rm(d, { recursive: true, force: true }); });

describe("settings", () => {
  test("missing file returns defaults", async () => {
    const f = await tmpFile();
    await fs.rm(f, { force: true });
    expect(await loadSettings(f)).toEqual(DEFAULT_SETTINGS);
  });

  test("partial file merges over defaults", async () => {
    const f = await tmpFile();
    await fs.writeFile(f, JSON.stringify({ wd: "~/Code" }), "utf8");
    expect(await loadSettings(f)).toEqual({ terminal: "iTerm", wd: "~/Code", cmd: "" });
  });

  test("save then load round-trips", async () => {
    const f = await tmpFile();
    const s = { terminal: "Terminal", wd: "/tmp", cmd: "/pr-queue" };
    await saveSettings(s, f);
    expect(await loadSettings(f)).toEqual(s);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `command pnpm test src/core/settings.test.ts`
Expected: FAIL — cannot find module `./settings.js`.

- [ ] **Step 3: Write the implementation**

```ts
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { configDir } from "./presets-store.js";
import { DEFAULT_SETTINGS, type Settings } from "./types.js";

export function settingsPath(env: NodeJS.ProcessEnv = process.env, home?: string): string {
  return path.join(configDir(env, home), "settings.json");
}

export async function loadSettings(file: string = settingsPath()): Promise<Settings> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_SETTINGS };
    throw err;
  }
}

export async function saveSettings(settings: Settings, file: string = settingsPath()): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(settings, null, 2), "utf8");
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `command pnpm test src/core/settings.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/settings.ts src/core/settings.test.ts
git commit -m "feat: settings store"
```

---

### Task 8: Preset actions (upsert / remove)

**Files:**
- Create: `src/main/preset-actions.ts`
- Test: `src/main/preset-actions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, test } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { upsertPreset, removePreset } from "./preset-actions.js";
import { emptyPreset } from "../core/types.js";

const dirs: string[] = [];
async function tmpFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "csl-act-"));
  dirs.push(dir);
  return path.join(dir, "presets.json");
}
afterEach(async () => { for (const d of dirs.splice(0)) await fs.rm(d, { recursive: true, force: true }); });

describe("preset-actions", () => {
  test("upsert with no id creates and assigns an id", async () => {
    const f = await tmpFile();
    const list = await upsertPreset({ ...emptyPreset(), name: "New" }, f);
    expect(list).toHaveLength(1);
    expect(list[0].id).not.toBe("");
  });

  test("upsert with an existing id updates in place", async () => {
    const f = await tmpFile();
    const first = await upsertPreset({ ...emptyPreset(), name: "A" }, f);
    const id = first[0].id;
    const list = await upsertPreset({ ...first[0], name: "A2" }, f);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, name: "A2" });
  });

  test("remove deletes by id", async () => {
    const f = await tmpFile();
    const first = await upsertPreset({ ...emptyPreset(), name: "A" }, f);
    const list = await removePreset(first[0].id, f);
    expect(list).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `command pnpm test src/main/preset-actions.test.ts`
Expected: FAIL — cannot find module `./preset-actions.js`.

- [ ] **Step 3: Write the implementation**

```ts
import { randomUUID } from "node:crypto";
import { loadPresets, savePresets } from "../core/presets-store.js";
import type { Preset } from "../core/types.js";

export async function upsertPreset(preset: Preset, file?: string): Promise<Preset[]> {
  const presets = await loadPresets(file);
  const p: Preset = { ...preset, id: preset.id || randomUUID() };
  const idx = presets.findIndex((x) => x.id === p.id);
  if (idx >= 0) presets[idx] = p;
  else presets.push(p);
  await savePresets(presets, file);
  return presets;
}

export async function removePreset(id: string, file?: string): Promise<Preset[]> {
  const presets = (await loadPresets(file)).filter((x) => x.id !== id);
  await savePresets(presets, file);
  return presets;
}
```

> Note: `loadPresets(undefined)` / `savePresets(list, undefined)` resolve their default (`presetsPath()`) — passing `file` through as `undefined` is intentional and safe.

- [ ] **Step 4: Run the test, verify it passes**

Run: `command pnpm test src/main/preset-actions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/preset-actions.ts src/main/preset-actions.test.ts
git commit -m "feat: preset upsert/remove actions"
```

---

### Task 9: macOS terminal spawner

**Files:**
- Create: `src/main/spawn/macos.ts`
- Test: `src/main/spawn/macos.test.ts`

Only the pure pieces (`osaQuote`, `buildMacScript`) are unit-tested; `launchMac` (which shells out to `osascript`) is exercised by manual verification in Task 12.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "vitest";
import { osaQuote, buildMacScript } from "./macos.js";

describe("osaQuote", () => {
  test("wraps in double quotes", () => {
    expect(osaQuote("claude --model opus")).toBe('"claude --model opus"');
  });
  test("escapes backslashes then double quotes", () => {
    expect(osaQuote('a"b\\c')).toBe('"a\\"b\\\\c"');
  });
});

describe("buildMacScript", () => {
  test("iTerm: creates a window and writes the launch string", () => {
    const lines = buildMacScript("claude --model opus", "iTerm");
    expect(lines[0]).toBe('tell application "iTerm"');
    expect(lines).toContain('    write text "claude --model opus"');
    expect(lines[lines.length - 1]).toBe("end tell");
  });

  test("Terminal: uses do script", () => {
    const lines = buildMacScript("claude", "Terminal");
    expect(lines[0]).toBe('tell application "Terminal"');
    expect(lines).toContain('  do script "claude"');
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `command pnpm test src/main/spawn/macos.test.ts`
Expected: FAIL — cannot find module `./macos.js`.

- [ ] **Step 3: Write the implementation**

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

/** Escape a string for use as an AppleScript double-quoted literal. */
export function osaQuote(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Build the AppleScript (as -e lines) that opens a terminal running the launch string. */
export function buildMacScript(launchString: string, terminalApp: string): string[] {
  if (terminalApp === "Terminal") {
    return ['tell application "Terminal"', "  activate", `  do script ${osaQuote(launchString)}`, "end tell"];
  }
  // Default: iTerm
  return [
    'tell application "iTerm"',
    "  activate",
    "  set w to (create window with default profile)",
    "  tell current session of w",
    `    write text ${osaQuote(launchString)}`,
    "  end tell",
    "end tell",
  ];
}

export async function launchMac(launchString: string, terminalApp = "iTerm"): Promise<void> {
  const args: string[] = [];
  for (const line of buildMacScript(launchString, terminalApp)) {
    args.push("-e", line);
  }
  await execFileP("osascript", args);
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `command pnpm test src/main/spawn/macos.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/spawn/macos.ts src/main/spawn/macos.test.ts
git commit -m "feat: macOS osascript terminal spawner"
```

---

### Task 10: Platform launch dispatcher

**Files:**
- Create: `src/main/spawn/index.ts`
- Test: `src/main/spawn/index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test, vi } from "vitest";
import { launchSpec } from "./index.js";
import type { LaunchSpec, Settings } from "../../core/types.js";

const spec: LaunchSpec = { model: "opus", mode: "auto", effort: "high", wd: "~/Code", cmd: "" };
const settings: Settings = { terminal: "iTerm", wd: "", cmd: "" };

describe("launchSpec", () => {
  test("on darwin, calls the mac launcher with the built string and terminal", async () => {
    const launchMac = vi.fn().mockResolvedValue(undefined);
    await launchSpec(spec, settings, { platform: "darwin", launchMac });
    expect(launchMac).toHaveBeenCalledWith(
      "cd '~/Code' && claude --model opus --permission-mode auto --effort high",
      "iTerm",
    );
  });

  test("on non-darwin, throws a clear not-implemented error", async () => {
    await expect(launchSpec(spec, settings, { platform: "win32" })).rejects.toThrow(/only implemented on macOS/);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `command pnpm test src/main/spawn/index.test.ts`
Expected: FAIL — cannot find module `./index.js`.

- [ ] **Step 3: Write the implementation**

```ts
import { buildLaunchString } from "../../core/launch-string.js";
import type { LaunchSpec, Settings } from "../../core/types.js";
import { launchMac } from "./macos.js";

export type MacLauncher = (launchString: string, terminalApp?: string) => Promise<void>;

export async function launchSpec(
  spec: LaunchSpec,
  settings: Settings,
  deps: { platform?: string; launchMac?: MacLauncher } = {},
): Promise<void> {
  const platform = deps.platform ?? process.platform;
  const launchString = buildLaunchString(spec);
  if (platform === "darwin") {
    await (deps.launchMac ?? launchMac)(launchString, settings.terminal);
    return;
  }
  throw new Error(`Launching is only implemented on macOS in v1 (platform: ${platform}).`);
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `command pnpm test src/main/spawn/index.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/spawn/index.ts src/main/spawn/index.test.ts
git commit -m "feat: platform launch dispatcher (macOS v1, others explicit stub)"
```

---

### Task 11: Electron shell — preload, IPC, main (tray + panel window)

**Files:**
- Create: `src/preload/preload.ts`, `src/main/ipc.ts`, `src/main/main.ts`

Non-testable (Electron runtime + GUI). Verified manually in Step 5.

- [ ] **Step 1: Write `src/preload/preload.ts`**

```ts
import { contextBridge, ipcRenderer } from "electron";
import type { LaunchSpec, Preset, Settings } from "../core/types.js";

contextBridge.exposeInMainWorld("launcher", {
  getPresets: (): Promise<Preset[]> => ipcRenderer.invoke("presets:get"),
  upsertPreset: (p: Preset): Promise<Preset[]> => ipcRenderer.invoke("presets:upsert", p),
  removePreset: (id: string): Promise<Preset[]> => ipcRenderer.invoke("presets:remove", id),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke("settings:get"),
  saveSettings: (s: Settings): Promise<Settings> => ipcRenderer.invoke("settings:save", s),
  launch: (spec: LaunchSpec): Promise<void> => ipcRenderer.invoke("launch", spec),
  validateWorkdir: (dir: string): Promise<boolean> => ipcRenderer.invoke("validate-workdir", dir),
});
```

- [ ] **Step 2: Write `src/main/ipc.ts`**

```ts
import { dialog, ipcMain } from "electron";
import { loadPresets, directoryExists } from "../core/presets-store.js";
import { loadSettings, saveSettings } from "../core/settings.js";
import { upsertPreset, removePreset } from "./preset-actions.js";
import { launchSpec } from "./spawn/index.js";
import type { LaunchSpec, Preset, Settings } from "../core/types.js";

export function registerIpc(): void {
  ipcMain.handle("presets:get", () => loadPresets());
  ipcMain.handle("presets:upsert", (_e, p: Preset) => upsertPreset(p));
  ipcMain.handle("presets:remove", (_e, id: string) => removePreset(id));
  ipcMain.handle("settings:get", () => loadSettings());
  ipcMain.handle("settings:save", async (_e, s: Settings) => {
    await saveSettings(s);
    return s;
  });
  ipcMain.handle("launch", async (_e, spec: LaunchSpec) => {
    const settings = await loadSettings();
    try {
      await launchSpec(spec, settings);
    } catch (err) {
      dialog.showErrorBox("Launch failed", err instanceof Error ? err.message : String(err));
      throw err;
    }
  });
  ipcMain.handle("validate-workdir", (_e, dir: string) => directoryExists(dir));
}
```

- [ ] **Step 3: Write `src/main/main.ts`**

```ts
import { app, BrowserWindow, Tray, nativeImage } from "electron";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { registerIpc } from "./ipc.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

let tray: Tray | null = null;
let panel: BrowserWindow | null = null;

function createPanel(): BrowserWindow {
  const win = new BrowserWindow({
    width: 420,
    height: 560,
    show: false,
    frame: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(path.join(dirname, "../renderer/index.html"));
  win.on("blur", () => win.hide());
  return win;
}

function togglePanel(): void {
  if (!panel) return;
  if (panel.isVisible()) {
    panel.hide();
    return;
  }
  // Position the panel just under the tray icon.
  const trayBounds = tray?.getBounds();
  const winBounds = panel.getBounds();
  if (trayBounds) {
    const x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
    const y = Math.round(trayBounds.y + trayBounds.height + 4);
    panel.setPosition(x, Math.max(y, 0), false);
  }
  panel.show();
  panel.focus();
}

app.whenReady().then(() => {
  if (process.platform === "darwin") app.dock?.hide();
  registerIpc();
  panel = createPanel();
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle("⚡");
  tray.setToolTip("Claude Launcher");
  tray.on("click", () => togglePanel());
});

// Tray app: keep running when the panel window is hidden/closed.
app.on("window-all-closed", () => {
  /* no-op: this is a menu-bar app */
});
```

- [ ] **Step 4: (No unit test — GUI/runtime.)**

- [ ] **Step 5: Commit**

```bash
git add src/preload/preload.ts src/main/ipc.ts src/main/main.ts
git commit -m "feat: Electron shell — tray toggles panel window, IPC wiring"
```

(The app won't run end-to-end until the renderer exists — verified in Task 12.)

---

### Task 12: Renderer panel (port the mockup, wire to IPC)

**Files:**
- Create: `src/renderer/index.html`, `src/renderer/panel.css`, `src/renderer/panel.ts`

Port `mockups/panel.html`: keep the markup/styles, replace the in-memory store with the `window.launcher` IPC API, and import the pure core modules for preview/validation. Non-testable (GUI) — verified by running the app in Step 5.

- [ ] **Step 1: Write `src/renderer/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Claude Launcher</title>
  <link rel="stylesheet" href="./panel.css" />
</head>
<body>
  <div class="win">
    <div class="titlebar">
      <span class="name">⚡ Claude Launcher</span>
      <button class="gear" id="open-settings">⚙</button>
    </div>
    <div class="compose">
      <div class="group"><span class="glabel">Model</span><div class="row" id="g-model"></div></div>
      <div class="group"><span class="glabel">Mode</span><div class="row" id="g-mode"></div></div>
      <div class="group"><span class="glabel">Effort</span><div class="row" id="g-effort"></div></div>
    </div>
    <div class="preview"><span class="caret">▸</span><span id="preview"></span></div>
    <div class="actions">
      <button class="act launch" id="launch">Launch ⏎</button>
      <button class="act save" id="save">★ Save</button>
    </div>
    <div class="lane-label">Presets — click to launch</div>
    <div class="presets" id="presets"></div>
  </div>

  <div class="backdrop" id="backdrop">
    <div class="sheet">
      <h2>Settings</h2>
      <p class="sub">Global defaults for quick launches. Presets keep their own dir + command.</p>
      <div class="sfld"><label>Terminal</label><div class="seg" id="seg-terminal"></div></div>
      <div class="sfld"><label>Default working directory</label><input id="s-wd" type="text" placeholder="/absolute/path — blank = current" /></div>
      <div class="sfld"><label>Default initial command / prompt</label><input id="s-cmd" type="text" placeholder="e.g. /pr-queue — blank = none" /></div>
      <div class="close"><button id="close-settings">Done</button></div>
    </div>
  </div>
  <div id="toast"></div>

  <script type="module" src="./panel.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `src/renderer/panel.css`**

Copy the entire contents of the `<style>…</style>` block from `mockups/panel.html` (everything between the tags, exclusive) verbatim into this file. That stylesheet is the settled design; do not restyle. (If `mockups/panel.html` is unavailable, the styles are the compact 400px-widget rules: stacked dial groups, 38px square buttons, dark-mode via `prefers-color-scheme`, a `.backdrop`/`.sheet` settings overlay, and a `#toast`.)

- [ ] **Step 3: Write `src/renderer/panel.ts`**

```ts
import { MODELS, MODES, EFFORTS, emptyPreset, type LaunchSpec, type Preset, type Settings } from "../core/types.js";
import { buildLaunchString } from "../core/launch-string.js";
import { validatePreset } from "../core/validate.js";

declare global {
  interface Window {
    launcher: {
      getPresets(): Promise<Preset[]>;
      upsertPreset(p: Preset): Promise<Preset[]>;
      removePreset(id: string): Promise<Preset[]>;
      getSettings(): Promise<Settings>;
      saveSettings(s: Settings): Promise<Settings>;
      launch(spec: LaunchSpec): Promise<void>;
      validateWorkdir(dir: string): Promise<boolean>;
    };
  }
}

const TERMINALS = ["iTerm", "Terminal"];

let presets: Preset[] = [];
let settings: Settings = { terminal: "iTerm", wd: "", cmd: "" };
const sel = { model: "opus", mode: "auto", effort: "high" };

const $ = (id: string): HTMLElement => document.getElementById(id)!;
const composed = (): LaunchSpec => ({ ...sel, wd: settings.wd, cmd: settings.cmd });

function sqBtn(label: string, on: boolean, onclick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "sq" + (on ? " on" : "");
  b.textContent = label;
  b.onclick = onclick;
  return b;
}

function renderDials(): void {
  const groups: [string, { value: string; label: string }[], "model" | "mode" | "effort"][] = [
    ["g-model", MODELS, "model"],
    ["g-mode", MODES, "mode"],
    ["g-effort", EFFORTS, "effort"],
  ];
  for (const [elId, options, key] of groups) {
    const host = $(elId);
    host.innerHTML = "";
    for (const o of options) {
      host.appendChild(
        sqBtn(o.label, sel[key] === o.value, () => {
          sel[key] = sel[key] === o.value ? "" : o.value;
          renderDials();
          renderPreview();
        }),
      );
    }
  }
}

function renderPreview(): void {
  $("preview").textContent = buildLaunchString(composed());
}

function presetEl(p: Preset, plain: boolean): HTMLElement {
  const el = document.createElement("div");
  el.className = "preset" + (plain ? " plain" : "");
  const meta = [p.model || "·", p.mode || "·", p.effort || "·"].join(" · ");
  const go = document.createElement("div");
  go.className = "go";
  go.innerHTML = `<span class="pname"></span><span class="pmeta"></span>`;
  (go.querySelector(".pname") as HTMLElement).textContent = p.name;
  (go.querySelector(".pmeta") as HTMLElement).textContent = plain ? "defaults" : meta;
  go.onclick = () => launch({ model: p.model, mode: p.mode, effort: p.effort, wd: p.wd, cmd: p.cmd }, p.name);
  el.appendChild(go);
  if (!plain) {
    const ed = document.createElement("button");
    ed.className = "edit";
    ed.textContent = "✎";
    ed.title = "Load into composer";
    ed.onclick = () => {
      sel.model = p.model;
      sel.mode = p.mode;
      sel.effort = p.effort;
      settings.wd = p.wd;
      settings.cmd = p.cmd;
      syncSettingsInputs();
      renderDials();
      renderPreview();
      toast(`Loaded ${p.name}`);
    };
    el.appendChild(ed);
  }
  return el;
}

function renderPresets(): void {
  const wrap = $("presets");
  wrap.innerHTML = "";
  wrap.appendChild(presetEl({ ...emptyPreset(), name: "Plain claude" }, true));
  for (const p of presets) wrap.appendChild(presetEl(p, false));
}

function renderTerminalSeg(): void {
  const seg = $("seg-terminal");
  seg.innerHTML = "";
  for (const t of TERMINALS) {
    seg.appendChild(
      sqBtn(t, settings.terminal === t, () => {
        settings.terminal = t;
        renderTerminalSeg();
        void window.launcher.saveSettings(settings);
      }),
    );
  }
}

function syncSettingsInputs(): void {
  ($("s-wd") as HTMLInputElement).value = settings.wd;
  ($("s-cmd") as HTMLInputElement).value = settings.cmd;
}

let toastT: ReturnType<typeof setTimeout>;
function toast(msg: string): void {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), 2400);
}

async function launch(spec: LaunchSpec, name: string): Promise<void> {
  toast(`Launching ${name || "session"}…`);
  try {
    await window.launcher.launch(spec);
  } catch {
    toast("Launch failed — see dialog");
  }
}

async function savePreset(): Promise<void> {
  const name = window.prompt("Name this preset:", "");
  if (!name) return;
  const preset: Preset = { ...emptyPreset(), name, ...sel, wd: settings.wd, cmd: settings.cmd };
  const result = validatePreset(preset);
  if (!result.valid) {
    toast(result.errors.join(" "));
    return;
  }
  presets = await window.launcher.upsertPreset(preset);
  renderPresets();
  toast(`Saved ${name}`);
}

async function init(): Promise<void> {
  [presets, settings] = await Promise.all([window.launcher.getPresets(), window.launcher.getSettings()]);

  $("launch").onclick = () => void launch(composed(), "current");
  $("save").onclick = () => void savePreset();
  $("open-settings").onclick = () => {
    syncSettingsInputs();
    renderTerminalSeg();
    $("backdrop").classList.add("open");
  };
  $("close-settings").onclick = () => {
    void window.launcher.saveSettings(settings);
    $("backdrop").classList.remove("open");
  };
  $("backdrop").onclick = (e) => {
    if (e.target === $("backdrop")) {
      void window.launcher.saveSettings(settings);
      $("backdrop").classList.remove("open");
    }
  };
  ($("s-wd") as HTMLInputElement).oninput = () => {
    settings.wd = ($("s-wd") as HTMLInputElement).value;
    renderPreview();
  };
  ($("s-cmd") as HTMLInputElement).oninput = () => {
    settings.cmd = ($("s-cmd") as HTMLInputElement).value;
    renderPreview();
  };

  renderDials();
  renderPreview();
  renderPresets();
  renderTerminalSeg();
  syncSettingsInputs();
}

window.addEventListener("DOMContentLoaded", () => void init());
```

- [ ] **Step 4: Build**

Run: `command pnpm build`
Expected: `tsc` compiles with no errors; `dist/renderer/index.html` and `dist/renderer/panel.css` are copied.

- [ ] **Step 5: Manual verification — run the app**

Run: `command pnpm start`
Verify (macOS):
1. A `⚡` appears in the menu bar; clicking it opens the widget under the icon.
2. Tapping Model/Mode/Effort squares toggles them; the `▸` preview updates and matches the dials.
3. **Launch ⏎** opens iTerm running the previewed command; a `claude` session starts with the flags applied.
4. Click a preset (e.g. seed one via **★ Save** first) → iTerm opens with that preset's dir + command.
5. **⚙** opens Settings; changing Terminal to "Terminal" then launching uses Apple Terminal; default dir/cmd persist across app restarts (check `~/.config/claude-launcher/settings.json`).
6. Saved presets persist across restarts (`~/.config/claude-launcher/presets.json`).

If iTerm isn't installed, set Terminal = "Terminal" in Settings and re-verify step 3.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/index.html src/renderer/panel.css src/renderer/panel.ts
git commit -m "feat: panel renderer wired to IPC (dials, presets, settings, launch)"
```

---

### Task 13: README + full test/lint gate

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

````markdown
# Claude Session Launcher

A menu-bar/tray widget that launches a `claude` CLI session in your terminal with
model / permission-mode / effort (plus working directory and an initial command)
preselected — and lets you save named presets for one-click launch.

## Develop

```bash
command pnpm install
command pnpm test      # unit tests (Vitest)
command pnpm start     # build + launch the app
```

## Config (portable)

- Presets: `~/.config/claude-launcher/presets.json`
- Settings: `~/.config/claude-launcher/settings.json`
- Override the location with `CLAUDE_LAUNCHER_CONFIG=/path/to/presets.json`.

Both are plain JSON — sync them via dotfiles.

## Platform support (v1)

macOS only (launches iTerm, or Apple Terminal via Settings). Windows/Linux report
"not implemented in v1" — the spawner is the only platform-specific piece.
````

- [ ] **Step 2: Run the full unit-test suite**

Run: `command pnpm test`
Expected: PASS — all suites green (types, launch-string, validate, normalize, presets-store, settings, preset-actions, spawn/macos, spawn/index).

- [ ] **Step 3: Verify a clean build**

Run: `command pnpm build`
Expected: no TypeScript errors; `dist/` populated.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README with dev + config instructions"
```

- [ ] **Step 5: Integrate the branch**

Create a GitHub repo if desired and open a PR from `feat/v1-panel-launcher`, or merge locally:

```bash
git checkout main
git merge --no-ff feat/v1-panel-launcher -m "feat: v1 panel launcher"
```

---

### Task 14 (optional): Package a macOS `.app`

**Files:**
- Modify: `package.json` (add electron-builder + a `dist:mac` script)

Deferred/optional for v1 (loose packaging is fine per NFR). When wanted:

- [ ] **Step 1: Add electron-builder**

Run: `command pnpm add -D electron-builder`

- [ ] **Step 2: Add build config + script to `package.json`**

```json
{
  "scripts": {
    "dist:mac": "pnpm build && electron-builder --mac --dir"
  },
  "build": {
    "appId": "com.jboho.claude-launcher",
    "files": ["dist/**", "package.json"],
    "mac": { "target": "dir", "category": "public.app-category.developer-tools" }
  }
}
```

(`--dir` produces an unsigned `.app` under `dist/` — no notarization, fine for personal use. Drag it to `~/Applications` and add to Login Items to autostart.)

- [ ] **Step 3: Build and smoke-test the `.app`**

Run: `command pnpm dist:mac` then open the produced `.app`; verify the menu-bar icon appears and a launch works.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "build: optional macOS .app packaging via electron-builder"
```

---

## Self-review

**Spec coverage:**
- REQ-001 tray icon → panel of combos → **Task 11** (tray toggles panel) + **Task 12** (presets lane).
- REQ-002 select → terminal launches with settings → **Task 12** (launch/preset click) → **Task 10/9** (spawn).
- REQ-003 combo = model/mode/effort/wd/cmd → **Task 2** (`Preset`/`LaunchSpec`) + **Task 3** (all mapped to flags/cd). *(fast dropped by decision.)*
- REQ-004 create/rename/edit/delete/save → **Task 8** (upsert/remove) + **Task 12** (Save, ✎ load, prompt-rename). *Note:* v1 has no in-panel delete button — deletion is via editing `presets.json` or a follow-up. Flagged below.
- REQ-005 configurable terminal → **Task 7** (settings) + **Task 12** (terminal seg) + **Task 9** (iTerm/Terminal).
- REQ-006 launches terminal itself → **Task 9** (osascript opens a new window).
- NFREQ-001 cross-platform, mac-first → **Task 10** (darwin impl, others explicit error).
- NFREQ-002 portable JSON → **Task 6/7** (`presets.json`/`settings.json`, `CLAUDE_LAUNCHER_CONFIG` override).
- NFREQ-003 loose packaging → **Task 14** optional/unsigned.
- EDGE-003 bad workdir → `validateWorkdir` IPC exists (**Task 11**); *not yet surfaced in the panel UI* — flagged below.
- EDGE-004 terminal not installed → Settings lets the user switch iTerm↔Terminal; **Task 12** step 5 covers the fallback path.

**Known v1 gaps (intentional, not placeholders):**
1. **No in-panel Delete button** — `removePreset` exists and is wired through preload, but the panel doesn't render a delete affordance. Add a small ✕ on preset hover in a follow-up if wanted.
2. **`validateWorkdir` not surfaced** — the IPC + core check exist; wiring a "directory not found" warning into the composer/preset-save is a follow-up.
3. **Windows/Linux** throw a clear, non-silent error (by design).

None of these block a working macOS v1; they're additive.

**Placeholder scan:** none — every step has full code or an explicit "no test / manual" note (Tasks 11, 12 GUI steps; Task 12 Step 2 references the mockup stylesheet verbatim by design).

**Type consistency:** `LaunchSpec`/`Preset`/`Settings` and `emptyPreset()` defined in Task 2 are used identically across Tasks 3–12. `launchSpec(spec, settings, deps)`, `buildLaunchString(spec)`, `buildMacScript(str, terminal)`, `launchMac(str, terminal)`, `upsertPreset/removePreset(x, file?)`, and the `window.launcher` API surface match between definition (preload, Task 11) and use (renderer, Task 12).
