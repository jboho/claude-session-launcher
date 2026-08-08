// Installs `window.launcher` over Tauri's IPC. Importing this module for its side effect
// (`import "./bridge.js"` in panel.ts) wires the renderer to the Rust command surface.
//
// This calls `window.__TAURI_INTERNALS__.invoke(...)` directly rather than importing `invoke`
// from "@tauri-apps/api/core". That package export is *exactly* a passthrough to the same
// window global (confirmed by reading core.js), so the behavior is identical — but this
// renderer has no bundler (build = `tsc` + a plain asset copy, see scripts/copy-assets.mjs) and
// loads modules as native browser ES modules, which cannot resolve a bare specifier like
// "@tauri-apps/api/core" without an import map. Only the `InvokeArgs` type is imported (erased
// at compile time by `import type`, so it never reaches the emitted JS / the browser).
//
// `__TAURI_INTERNALS__` is the marker Tauri v2's webview injects before any page script runs
// (verified against node_modules/@tauri-apps/api 2.11.1's core.js). The isTauri() guard keeps
// this a no-op when the built renderer is opened in a plain browser (e.g. for measurement),
// where panel.ts's init() then falls back to defaults.
//
// Command names below match the `#[tauri::command]` function names in src-tauri/src/commands.rs
// and src-tauri/src/lib.rs exactly. Argument keys match the Rust parameter names: Tauri's
// command macro defaults to `rename_all = "camelCase"` (verified in tauri-macros 2.6.3's
// wrapper.rs, `argument_case: ArgumentCase::Camel`), but every parameter here (`preset`, `id`,
// `settings`, `spec`, `dir`, `accelerator`) is a single word, so camelCase and snake_case
// coincide and there is no renaming to get wrong.
import type { InvokeArgs } from "@tauri-apps/api/core";
import type { LaunchSpec, Preset, Settings } from "../core/types.js";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke<T>(cmd: string, args?: InvokeArgs): Promise<T>;
    };
  }
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && window.__TAURI_INTERNALS__ !== undefined;
}

function invoke<T>(cmd: string, args?: InvokeArgs): Promise<T> {
  return window.__TAURI_INTERNALS__!.invoke<T>(cmd, args);
}

function installTauriBridge(): void {
  window.launcher = {
    getPresets: (): Promise<Preset[]> => invoke("get_presets"),
    upsertPreset: (preset: Preset): Promise<Preset[]> => invoke("upsert_preset", { preset }),
    removePreset: (id: string): Promise<Preset[]> => invoke("remove_preset", { id }),
    getSettings: (): Promise<Settings> => invoke("get_settings"),
    saveSettings: (settings: Settings): Promise<Settings> => invoke("save_settings_cmd", { settings }),
    launch: (spec: LaunchSpec): Promise<void> => invoke("launch", { spec }),
    previewLaunchString: (spec: LaunchSpec): Promise<string> => invoke("preview_launch_string", { spec }),
    validateWorkdir: (dir: string): Promise<boolean> => invoke("validate_workdir", { dir }),
    detectClaude: (): Promise<{ found: boolean; path?: string }> => invoke("claude_detect"),
    detectTerminals: (): Promise<string[]> => invoke("terminals_detect"),
    setHotkey: (accelerator: string): Promise<string> => invoke("set_hotkey", { accelerator }),
  };
}

if (isTauri()) {
  installTauriBridge();
}
