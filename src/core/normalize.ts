import { DEFAULT_SETTINGS, emptyPreset, type Option, type Preset, type Settings } from "./types.js";

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Coerce a parsed settings.json into a Settings. The file is hand-editable and synced
 * via dotfiles, so a field can be any JSON type — and claudeBinary in particular is fed
 * to resolveClaudeCommand(), which calls .trim() on it. Unknown keys are dropped rather
 * than spread through onto Settings.
 */
export function normalizeSettings(raw: unknown): Settings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const withDefault = (v: unknown, fallback: string): string => (typeof v === "string" ? v : fallback);
  return {
    terminal: withDefault(o.terminal, DEFAULT_SETTINGS.terminal),
    wd: str(o.wd),
    cmd: str(o.cmd),
    claudeBinary: str(o.claudeBinary),
    models: normalizeModels(o.models),
    hotkey: str(o.hotkey),
  };
}

/** Keep only entries with a usable `value`; a missing label falls back to the value. */
function normalizeModels(raw: unknown): Option[] {
  if (!Array.isArray(raw)) return [];
  const out: Option[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const value = str((entry as Record<string, unknown>).value);
    if (!value) continue;
    out.push({ value, label: str((entry as Record<string, unknown>).label) || value });
  }
  return out;
}

export function normalizePreset(raw: unknown): Preset {
  const o = (raw ?? {}) as Record<string, unknown>;
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
