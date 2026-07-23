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

/** Seeded on first run (when no presets file exists). ids are assigned at seed time. */
export const STARTER_PRESETS: Preset[] = [
  { id: "", name: "Plan", model: "opus", mode: "plan", effort: "", wd: "", cmd: "" },
  { id: "", name: "Build", model: "opus", mode: "acceptEdits", effort: "high", wd: "", cmd: "" },
  { id: "", name: "Autopilot", model: "opus", mode: "auto", effort: "high", wd: "", cmd: "" },
  { id: "", name: "Quick", model: "haiku", mode: "", effort: "", wd: "", cmd: "" },
  { id: "", name: "Explore", model: "sonnet", mode: "plan", effort: "", wd: "", cmd: "" },
];
