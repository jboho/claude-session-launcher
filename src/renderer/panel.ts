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
