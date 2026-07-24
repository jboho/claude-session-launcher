import {
  MODELS,
  MODES,
  EFFORTS,
  DEFAULT_MODE,
  isHaiku,
  HAIKU_BLOCKED_MODES,
  emptyPreset,
  type LaunchSpec,
  type Preset,
  type Settings,
} from "../core/types.js";
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
      detectClaude(): Promise<{ found: boolean; path?: string }>;
      detectTerminals(): Promise<string[]>;
      setHotkey(accel: string): Promise<boolean>;
    };
  }
}

const TERMINALS = ["iTerm", "Terminal", "Ghostty"];

let presets: Preset[] = [];
let settings: Settings = { terminal: "iTerm", wd: "", cmd: "", claudeBinary: "", models: [], hotkey: "" };
const sel = { model: "opus", mode: "auto", effort: "high" };
// Transient composer state (per-launch). wd seeds from the settings default; cmd
// is entered inline before each launch (not persisted).
const composer = { wd: "", cmd: "" };

const $ = (id: string): HTMLElement => document.getElementById(id)!;
// No mode selected => manual (ask for everything).
const composed = (): LaunchSpec => ({
  ...sel,
  mode: sel.mode || DEFAULT_MODE,
  wd: composer.wd,
  cmd: composer.cmd,
});

function sqBtn(label: string, on: boolean, onclick: () => void, disabled = false): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "sq" + (on ? " on" : "") + (disabled ? " disabled" : "");
  b.textContent = label;
  if (!disabled) b.onclick = onclick;
  return b;
}

function renderDials(): void {
  // Haiku can't do --effort, nor the autonomous modes (auto/bypass) — grey those out.
  const haiku = isHaiku(sel.model);
  if (haiku) {
    sel.effort = "";
    if (HAIKU_BLOCKED_MODES.includes(sel.mode)) sel.mode = "";
  }
  const groups: [string, { value: string; label: string }[], "model" | "mode" | "effort"][] = [
    ["g-model", MODELS, "model"],
    ["g-mode", MODES, "mode"],
    ["g-effort", EFFORTS, "effort"],
  ];
  for (const [elId, options, key] of groups) {
    const host = $(elId);
    host.innerHTML = "";
    for (const o of options) {
      const disabled =
        haiku && (key === "effort" || (key === "mode" && HAIKU_BLOCKED_MODES.includes(o.value)));
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
      composer.wd = p.wd;
      composer.cmd = p.cmd;
      ($("cmd") as HTMLInputElement).value = p.cmd;
      renderDials();
      renderPreview();
      toast(`Loaded ${p.name}`);
    };
    el.appendChild(ed);

    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "✕";
    del.title = "Delete preset";
    del.onclick = (e) => {
      e.stopPropagation();
      void deletePreset(p);
    };
    el.appendChild(del);
  }
  return el;
}

async function deletePreset(p: Preset): Promise<void> {
  presets = await window.launcher.removePreset(p.id);
  renderPresets();
  toast(`Deleted ${p.name}`);
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

function syncInputs(): void {
  ($("s-wd") as HTMLInputElement).value = settings.wd;
  ($("s-claude") as HTMLInputElement).value = settings.claudeBinary;
  ($("cmd") as HTMLInputElement).value = composer.cmd;
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

function openSaveRow(): void {
  const input = $("save-name") as HTMLInputElement;
  input.value = "";
  $("save-row").classList.add("open");
  input.focus();
}

function closeSaveRow(): void {
  $("save-row").classList.remove("open");
}

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

async function confirmSave(): Promise<void> {
  const input = $("save-name") as HTMLInputElement;
  const name = input.value.trim();
  const preset: Preset = { ...emptyPreset(), name, ...sel, wd: composer.wd, cmd: composer.cmd };
  const result = validatePreset(preset);
  if (!result.valid) {
    toast(result.errors.join(" "));
    input.focus();
    return;
  }
  presets = await window.launcher.upsertPreset(preset);
  closeSaveRow();
  renderPresets();
  toast(`Saved ${name}`);
}

async function init(): Promise<void> {
  try {
    [presets, settings] = await Promise.all([window.launcher.getPresets(), window.launcher.getSettings()]);
  } catch {
    presets = [];
    settings = { terminal: "iTerm", wd: "", cmd: "", claudeBinary: "", models: [], hotkey: "" };
    toast("Couldn't load saved config — check presets.json / settings.json");
  }
  composer.wd = settings.wd;
  composer.cmd = "";

  $("launch").onclick = () => void launch(composed(), "current");
  $("save").onclick = () => openSaveRow();
  $("save-confirm").onclick = () => void confirmSave();
  $("save-cancel").onclick = () => closeSaveRow();
  ($("save-name") as HTMLInputElement).onkeydown = (e) => {
    if (e.key === "Enter") void confirmSave();
    else if (e.key === "Escape") closeSaveRow();
  };
  ($("cmd") as HTMLInputElement).oninput = () => {
    composer.cmd = ($("cmd") as HTMLInputElement).value;
    renderPreview();
  };
  $("open-settings").onclick = () => {
    syncInputs();
    renderTerminalSeg();
    $("backdrop").classList.add("open");
  };
  $("close-settings").onclick = () => {
    void window.launcher.saveSettings(settings);
    $("backdrop").classList.remove("open");
    void refreshClaudeStatus();
  };
  $("backdrop").onclick = (e) => {
    if (e.target === $("backdrop")) {
      void window.launcher.saveSettings(settings);
      $("backdrop").classList.remove("open");
      void refreshClaudeStatus();
    }
  };
  ($("s-wd") as HTMLInputElement).oninput = () => {
    const v = ($("s-wd") as HTMLInputElement).value;
    settings.wd = v;
    composer.wd = v;
    renderPreview();
  };
  ($("s-claude") as HTMLInputElement).oninput = () => {
    settings.claudeBinary = ($("s-claude") as HTMLInputElement).value;
  };

  renderDials();
  renderPreview();
  renderPresets();
  renderTerminalSeg();
  syncInputs();
  void refreshClaudeStatus();
}

window.addEventListener("DOMContentLoaded", () => {
  init().catch(() => toast("Initialization failed"));
});
