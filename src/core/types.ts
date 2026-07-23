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
