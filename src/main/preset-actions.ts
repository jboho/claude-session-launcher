import { randomUUID } from "node:crypto";
import { loadPresets, savePresets } from "../core/presets-store.js";
import type { Preset } from "../core/types.js";

export async function upsertPreset(preset: Preset, file?: string): Promise<Preset[]> {
  const presets = await loadPresets(file);
  const p: Preset = { ...preset, id: preset.id || randomUUID() };
  const idx = presets.findIndex((x) => x.id === p.id);
  if (idx >= 0) presets[idx] = p;
  else presets.push(p);
  await savePresets(presets, file);
  return presets;
}

export async function removePreset(id: string, file?: string): Promise<Preset[]> {
  const presets = (await loadPresets(file)).filter((x) => x.id !== id);
  await savePresets(presets, file);
  return presets;
}
