import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { presetsPath, savePresets } from "../core/presets-store.js";
import { STARTER_PRESETS } from "../core/types.js";

/**
 * On first run only (no presets file yet), seed the starter presets. If the file
 * exists — even as an empty array the user deliberately cleared — do nothing.
 */
export async function ensureSeedPresets(file: string = presetsPath()): Promise<void> {
  if (existsSync(file)) return;
  const seeded = STARTER_PRESETS.map((p) => ({ ...p, id: randomUUID() }));
  await savePresets(seeded, file);
}
