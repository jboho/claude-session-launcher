import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
import { normalizePreset } from "./normalize.js";
import type { Preset } from "./types.js";

export function configDir(
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir(),
  platform: NodeJS.Platform = process.platform,
): string {
  const p = platform === "win32" ? path.win32 : path.posix;
  if (env.CLAUDE_LAUNCHER_CONFIG) return p.dirname(env.CLAUDE_LAUNCHER_CONFIG);
  if (platform === "win32") {
    return p.join(env.APPDATA ?? p.join(home, "AppData", "Roaming"), "claude-launcher");
  }
  return p.join(env.XDG_CONFIG_HOME ?? p.join(home, ".config"), "claude-launcher");
}

export function presetsPath(env: NodeJS.ProcessEnv = process.env, home?: string): string {
  if (env.CLAUDE_LAUNCHER_CONFIG) return env.CLAUDE_LAUNCHER_CONFIG;
  return path.join(configDir(env, home), "presets.json");
}

export async function loadPresets(file: string = presetsPath()): Promise<Preset[]> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Presets file ${file} is not valid JSON.`);
  }
  if (!Array.isArray(parsed)) throw new Error(`Presets file ${file} must be a JSON array of presets.`);
  return parsed.map((r) => {
    const p = normalizePreset(r);
    if (!p.id) p.id = randomUUID();
    return p;
  });
}

export async function savePresets(presets: Preset[], file: string = presetsPath()): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(presets, null, 2), "utf8");
  await fs.rename(tmp, file);
}

export async function directoryExists(dir: string): Promise<boolean> {
  try {
    const st = await fs.stat(dir);
    return st.isDirectory();
  } catch {
    return false;
  }
}
