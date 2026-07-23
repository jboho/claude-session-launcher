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
