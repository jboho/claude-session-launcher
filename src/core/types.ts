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

/** No mode selected = manual approval (ask for everything). */
export const DEFAULT_MODE = "manual";

/** Haiku (4.5) does not support the --effort flag (it errors). */
export function isHaiku(model: string): boolean {
  const m = model.trim().toLowerCase();
  return m === "haiku" || m.startsWith("claude-haiku");
}

/** Autonomous permission modes are gated to capable models — Haiku rejects them. */
export const HAIKU_BLOCKED_MODES = ["auto"];

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

export function emptyPreset(): Preset {
  return { id: "", name: "", model: "", mode: "", effort: "", wd: "", cmd: "" };
}
