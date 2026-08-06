import { promises as fs } from "node:fs";
import * as path from "node:path";
import { configDir } from "./presets-store.js";
import { normalizeSettings } from "./normalize.js";
import { DEFAULT_SETTINGS, type Settings } from "./types.js";

export function settingsPath(env: NodeJS.ProcessEnv = process.env, home?: string): string {
  return path.join(configDir(env, home), "settings.json");
}

export async function loadSettings(file: string = settingsPath()): Promise<Settings> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return normalizeSettings(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_SETTINGS };
    throw err;
  }
}

export async function saveSettings(settings: Settings, file: string = settingsPath()): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(settings, null, 2), "utf8");
}
