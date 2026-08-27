import {
  MODES,
  EFFORTS,
  OUTPUT_STYLES,
  THINKING_BUDGETS,
  DEFAULT_MODE,
  capabilitiesFor,
  effectiveModels,
  emptyPreset,
  type LaunchSpec,
  type Preset,
  type Settings,
} from "../core/types.js";
import { validatePreset, isValidModelValue } from "../core/validate.js";
import { eventToAccelerator } from "../core/accelerator.js";
import "./bridge.js";

declare global {
  interface Window {
    launcher: {
      getPresets(): Promise<Preset[]>;
      upsertPreset(p: Preset): Promise<Preset[]>;
      removePreset(id: string): Promise<Preset[]>;
      getSettings(): Promise<Settings>;
      saveSettings(s: Settings): Promise<Settings>;
      launch(spec: LaunchSpec): Promise<void>;
      // Builds the launch string via the same Rust code the `launch` command runs, so the
      // preview can never drift from what actually executes.
      previewLaunchString(spec: LaunchSpec): Promise<string>;
      validateWorkdir(dir: string): Promise<boolean>;
      detectClaude(): Promise<{ found: boolean; path?: string }>;
      detectTerminals(): Promise<string[]>;
      setHotkey(accel: string): Promise<string>;
      addStarterPresets(): Promise<Preset[]>;
      runAutoModeCritique(): Promise<void>;
    };
  }
}

let availableTerminals: string[] = ["Terminal"]; // filled by detection; Terminal always present
let cancelRecording: (() => void) | null = null;

let presets: Preset[] = [];
let settings: Settings = { terminal: "iTerm", wd: "", cmd: "", claudeBinary: "", models: [], hotkey: "", forkSubagent: "" };
const sel = { model: "opus", mode: "auto", effort: "high", outputStyle: "", thinkingBudget: "" };
// Transient composer state (per-launch). wd seeds from the settings default; cmd
// is entered inline before each launch (not persisted).
const composer = { wd: "", cmd: "", worktree: false, worktreeName: "" };

const $ = (id: string): HTMLElement => document.getElementById(id)!;
// No mode selected => manual (ask for everything).
const composed = (): LaunchSpec => ({
  model: sel.model,
  mode: sel.mode || DEFAULT_MODE,
  effort: sel.effort,
  outputStyle: sel.outputStyle,
  thinkingBudget: sel.thinkingBudget,
  wd: composer.wd,
  cmd: composer.cmd,
  worktree: composer.worktree,
  worktreeName: composer.worktreeName,
});

/** The launchable LaunchSpec view of a saved preset (drops its id/name). */
const launchSpecOf = (p: Preset): LaunchSpec => ({
  model: p.model,
  mode: p.mode,
  effort: p.effort,
  outputStyle: p.outputStyle,
  thinkingBudget: p.thinkingBudget,
  wd: p.wd,
  cmd: p.cmd,
  worktree: p.worktree,
  worktreeName: p.worktreeName,
});

/** Turn off the webview's text assistance for technical inputs (ids, paths, commands). */
function disableTextAssist(input: HTMLInputElement): void {
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("autocomplete", "off");
  input.spellcheck = false;
}

function sqBtn(label: string, on: boolean, onclick: () => void, disabled = false): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "sq" + (on ? " on" : "") + (disabled ? " disabled" : "");
  b.textContent = label;
  if (!disabled) b.onclick = onclick;
  return b;
}

function currentModels(): { value: string; label: string }[] {
  return effectiveModels(settings.models);
}

function renderDials(): void {
  const caps = capabilitiesFor(sel.model);
  if (!caps.effort) sel.effort = "";
  if (caps.blockedModes.includes(sel.mode)) sel.mode = "";
  if (!caps.thinkingBudget) sel.thinkingBudget = "";
  const groups: [string, { value: string; label: string }[], keyof typeof sel][] = [
    ["g-model", currentModels(), "model"],
    ["g-mode", MODES, "mode"],
    ["g-effort", EFFORTS, "effort"],
    ["g-style", OUTPUT_STYLES, "outputStyle"],
    ["g-thinking", THINKING_BUDGETS, "thinkingBudget"],
  ];
  for (const [elId, options, key] of groups) {
    const host = $(elId);
    host.innerHTML = "";
    for (const o of options) {
      const disabled =
        (key === "effort" && !caps.effort) ||
        (key === "mode" && caps.blockedModes.includes(o.value)) ||
        (key === "thinkingBudget" && !caps.thinkingBudget);
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

/** Reflect the transient worktree toggle + name into the composer row. */
function renderWorktree(): void {
  const toggle = $("wt-toggle") as HTMLButtonElement;
  toggle.classList.toggle("on", composer.worktree);
  toggle.textContent = composer.worktree ? "On" : "Off";
  const name = $("wt-name") as HTMLInputElement;
  name.disabled = !composer.worktree;
  name.value = composer.worktreeName;
}

// Guards against a slow/out-of-order previewLaunchString response clobbering a newer one.
let previewToken = 0;
function renderPreview(): void {
  const spec = composed();
  // The preview is built by the same Rust code path `launch` runs, so it can never drift from
  // what actually executes.
  const token = ++previewToken;
  window.launcher
    .previewLaunchString(spec)
    .then((text) => {
      if (token === previewToken) $("preview").textContent = text;
    })
    .catch(() => {
      // previewLaunchString rejects only for a spec that `launch` would also refuse (e.g. an
      // unsafe dial). Clear the preview rather than show a misleading locally-built string.
      if (token === previewToken) $("preview").textContent = "";
    });
}

function presetEl(p: Preset, plain: boolean): HTMLElement {
  const el = document.createElement("div");
  el.className = "preset" + (plain ? " plain" : "");
  const extras = [
    p.worktree ? "wt" : "",
    p.outputStyle ? p.outputStyle.toLowerCase() : "",
    p.thinkingBudget === "0" ? "think:off" : "",
  ].filter(Boolean);
  const meta = [p.model || "·", p.mode || "·", p.effort || "·", ...extras].join(" · ");
  const go = document.createElement("div");
  go.className = "go";
  go.innerHTML = `<span class="pname"></span><span class="pmeta"></span>`;
  (go.querySelector(".pname") as HTMLElement).textContent = p.name;
  (go.querySelector(".pmeta") as HTMLElement).textContent = plain ? "defaults" : meta;
  go.onclick = () => launch(launchSpecOf(p), p.name);
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
      sel.outputStyle = p.outputStyle;
      sel.thinkingBudget = p.thinkingBudget;
      composer.wd = p.wd;
      composer.cmd = p.cmd;
      composer.worktree = p.worktree;
      composer.worktreeName = p.worktreeName;
      ($("cmd") as HTMLInputElement).value = p.cmd;
      renderWorktree();
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

const FORK_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Default" },
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];

function renderFork(): void {
  const seg = $("seg-fork");
  seg.innerHTML = "";
  for (const o of FORK_OPTIONS) {
    seg.appendChild(
      sqBtn(o.label, (settings.forkSubagent || "") === o.value, () => {
        settings.forkSubagent = o.value;
        renderFork();
        renderPreview();
        void window.launcher.saveSettings(settings);
      }),
    );
  }
}

function renderModelEditor(): void {
  const host = $("model-editor");
  host.innerHTML = "";
  currentModels().forEach((m, i) => {
    const row = document.createElement("div");
    row.className = "model-row";
    const val = document.createElement("input");
    val.value = m.value;
    val.placeholder = "value (e.g. opus)";
    disableTextAssist(val); // model ids are technical tokens — never autocapitalize/-correct
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
    const inputs = row.querySelectorAll("input");
    const valEl = inputs[0] as HTMLInputElement;
    const labEl = inputs[1] as HTMLInputElement;
    const value = valEl.value.trim();
    const label = labEl.value.trim() || value;
    const ok = isValidModelValue(value);
    valEl.classList.toggle("invalid", !ok);
    if (!ok) {
      bad = true;
      continue;
    }
    next.push({ value, label });
  }
  if (bad) {
    toast("Model value must be letters/digits/._- (no spaces or brackets)");
    return;
  }
  settings.models = next;
  persistModels();
}

function persistModels(): void {
  void window.launcher.saveSettings(settings);
  renderModelEditor();
  renderDials();
  renderPreview();
}

function initHotkeyRecorder(): void {
  const rec = $("hotkey-rec") as HTMLButtonElement;
  const render = (): void => { rec.textContent = settings.hotkey || "Alt+W"; };
  render();
  rec.onclick = () => {
    cancelRecording?.(); // guard re-entrancy: detach any prior in-progress listener
    rec.classList.add("recording");
    rec.textContent = "Press a shortcut…";
    const cleanup = (): void => {
      window.removeEventListener("keydown", onKey, true);
      cancelRecording = null;
      rec.classList.remove("recording");
    };
    const onKey = async (e: KeyboardEvent): Promise<void> => {
      if (e.key === "Escape") { cleanup(); render(); return; }
      e.preventDefault();
      const accel = eventToAccelerator(e);
      if (!accel) return; // wait for a full chord (modifier + key)
      cleanup();
      const active = await window.launcher.setHotkey(accel);
      settings.hotkey = active;
      void window.launcher.saveSettings(settings);
      toast(active === accel
        ? `Hotkey set to ${accel}`
        : (active ? `${accel} unavailable — using ${active}` : `${accel} unavailable — no hotkey active`));
      render();
    };
    cancelRecording = cleanup;
    window.addEventListener("keydown", onKey, true);
  };
  ($("hotkey-reset") as HTMLButtonElement).onclick = async () => {
    const active = await window.launcher.setHotkey("Alt+W");
    settings.hotkey = active === "Alt+W" ? "" : active;
    void window.launcher.saveSettings(settings);
    render();
    toast(active ? `Hotkey reset to ${active}` : "Alt+W unavailable");
  };
  window.addEventListener("blur", () => { cancelRecording?.(); render(); });
  window.addEventListener("focusin", (e) => {
    if (cancelRecording && e.target !== rec) { cancelRecording(); render(); }
  });
}

function closeSettings(): void {
  cancelRecording?.();
  settings.models = settings.models.filter((m) => isValidModelValue(m.value));
  void window.launcher.saveSettings(settings);
  $("backdrop").classList.remove("open");
  void refreshClaudeStatus();
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
  const preset: Preset = {
    ...emptyPreset(), name, ...sel,
    wd: composer.wd, cmd: composer.cmd,
    worktree: composer.worktree, worktreeName: composer.worktreeName,
  };
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
    settings = { terminal: "iTerm", wd: "", cmd: "", claudeBinary: "", models: [], hotkey: "", forkSubagent: "" };
    toast("Couldn't load saved config — check presets.json / settings.json");
  }
  composer.wd = settings.wd;
  composer.cmd = "";

  try {
    availableTerminals = await window.launcher.detectTerminals();
    if (availableTerminals.length === 0) availableTerminals = ["Terminal"];
  } catch {
    availableTerminals = ["Terminal"];
  }

  if (!availableTerminals.includes(settings.terminal)) {
    settings.terminal = availableTerminals.includes("Terminal")
      ? "Terminal"
      : (availableTerminals[0] ?? "Terminal");
    void window.launcher.saveSettings(settings);
  }

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
  disableTextAssist($("wt-name") as HTMLInputElement); // branch names are technical tokens
  $("wt-toggle").onclick = () => {
    composer.worktree = !composer.worktree;
    renderWorktree();
    renderPreview();
  };
  ($("wt-name") as HTMLInputElement).oninput = () => {
    composer.worktreeName = ($("wt-name") as HTMLInputElement).value;
    renderPreview();
  };
  $("copy-preview").onclick = async () => {
    const text = $("preview").textContent ?? "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast("Command copied");
    } catch {
      toast("Copy failed — clipboard unavailable");
    }
  };
  $("open-settings").onclick = () => {
    syncInputs();
    renderTerminalSeg();
    renderFork();
    renderModelEditor();
    $("backdrop").classList.add("open");
  };
  $("critique-automode").onclick = () => {
    void window.launcher
      .runAutoModeCritique()
      .then(() => toast("Opened auto-mode critique in your terminal"))
      .catch(() => toast("Couldn't open the terminal"));
  };
  $("add-starters").onclick = async () => {
    try {
      presets = await window.launcher.addStarterPresets();
      renderPresets();
      toast("Starter presets added");
    } catch {
      toast("Couldn't add starter presets");
    }
  };
  $("close-settings").onclick = () => closeSettings();
  $("backdrop").onclick = (e) => {
    if (e.target === $("backdrop")) closeSettings();
  };
  ($("s-wd") as HTMLInputElement).oninput = () => {
    const v = ($("s-wd") as HTMLInputElement).value;
    settings.wd = v;
    composer.wd = v;
    renderPreview();
  };
  ($("s-claude") as HTMLInputElement).oninput = () => {
    settings.claudeBinary = ($("s-claude") as HTMLInputElement).value;
    renderPreview();
  };
  $("add-model").onclick = () => {
    settings.models = [...currentModels(), { value: "", label: "" }];
    renderModelEditor();
  };

  renderDials();
  renderWorktree();
  renderPreview();
  renderPresets();
  renderTerminalSeg();
  syncInputs();
  void refreshClaudeStatus();
  initHotkeyRecorder();
}

window.addEventListener("DOMContentLoaded", () => {
  init().catch(() => toast("Initialization failed"));
});
