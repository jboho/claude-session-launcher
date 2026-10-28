export interface Option {
  value: string;
  label: string;
}

export const MODELS: Option[] = [
  { value: "opus", label: "Opus" },
  { value: "sonnet", label: "Sonnet" },
  { value: "haiku", label: "Haiku" },
  { value: "fable", label: "Fable" },
];

export const MODES: Option[] = [
  { value: "plan", label: "Plan" },
  { value: "auto", label: "Auto" },
  { value: "acceptEdits", label: "Accept" },
  { value: "dontAsk", label: "Don't Ask" },
];

/** No mode selected = manual approval (ask for everything). */
export const DEFAULT_MODE = "manual";

/**
 * Whether MAX_THINKING_TOKENS=0 actually turns thinking off. Measured on Claude Code 2.1.312:
 * it does for the 4.x models and for Opus 5 / Sonnet 5, and it does not for the 5.5 models or
 * Fable, which keep thinking on. The aliases (and no `--model` at all) resolve to the 5.5 models,
 * so only an explicit older full id passes; anything unrecognized counts as inert.
 */
export function honorsThinkingBudget(model: string): boolean {
  const m = /^claude-(?:opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?(?=$|-|\[)/.exec(model.trim().toLowerCase());
  if (!m) return false;
  const major = Number(m[1]);
  return major <= 4 || (major === 5 && m[2] === undefined);
}

export interface ModelCapabilities {
  effort: boolean; // model supports --effort
  blockedModes: string[]; // permission modes the model rejects
  thinkingBudget: boolean; // MAX_THINKING_TOKENS=0 really turns thinking off for this model
}

/**
 * Capabilities for a model value. Haiku 4.5 now accepts `--effort` and the autonomous modes
 * (verified against the installed CLI), so no family restricts those any more; only the
 * thinking budget depends on the model (see `honorsThinkingBudget`).
 */
export function capabilitiesFor(model: string): ModelCapabilities {
  return { effort: true, blockedModes: [], thinkingBudget: honorsThinkingBudget(model) };
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

/**
 * Output styles offered as a toggle dial. Each maps to `--settings '{"outputStyle":"…"}'`;
 * none selected (outputStyle "") = the user's default. Extend as more built-ins are added.
 */
export const OUTPUT_STYLES: Option[] = [
  { value: "Concise", label: "Concise" },
];

/**
 * Thinking-budget dial (the coarse knob below `--effort low`). "0" turns thinking off via
 * MAX_THINKING_TOKENS on the models that honor it; none selected (thinkingBudget "") = the model default.
 */
export const THINKING_BUDGETS: Option[] = [
  { value: "0", label: "Off" },
];

/** A single launchable configuration. "" (or false) for any field = don't pass that flag. */
export interface LaunchSpec {
  model: string;
  mode: string;
  effort: string;
  wd: string;
  cmd: string;
  outputStyle: string; // --settings '{"outputStyle":"…"}'; "" = omit
  thinkingBudget: string; // MAX_THINKING_TOKENS=<value>; "" = omit
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
  forkSubagent: string; // "" = CLI default | "on" (=1) | "off" (=0) — CLAUDE_CODE_FORK_SUBAGENT
}

export const DEFAULT_SETTINGS: Settings = {
  terminal: "iTerm", wd: "", cmd: "", claudeBinary: "", models: [], hotkey: "", forkSubagent: "",
};

export function emptyPreset(): Preset {
  return {
    id: "", name: "", model: "", mode: "", effort: "", wd: "", cmd: "",
    outputStyle: "", thinkingBudget: "",
  };
}
