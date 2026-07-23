import { afterEach, describe, expect, test } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ensureSeedPresets } from "./seed.js";
import { loadPresets } from "../core/presets-store.js";
import { STARTER_PRESETS } from "../core/types.js";

const dirs: string[] = [];
async function tmpFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "csl-seed-"));
  dirs.push(dir);
  return path.join(dir, "presets.json");
}
afterEach(async () => {
  for (const d of dirs.splice(0)) await fs.rm(d, { recursive: true, force: true });
});

describe("ensureSeedPresets", () => {
  test("seeds the starter presets when no file exists", async () => {
    const f = await tmpFile();
    await fs.rm(f, { force: true });
    await ensureSeedPresets(f);
    const loaded = await loadPresets(f);
    expect(loaded.map((p) => p.name)).toEqual(STARTER_PRESETS.map((p) => p.name));
    expect(loaded.every((p) => p.id !== "")).toBe(true);
  });

  test("does nothing when a presets file already exists (even empty)", async () => {
    const f = await tmpFile();
    await fs.writeFile(f, "[]", "utf8");
    await ensureSeedPresets(f);
    expect(await loadPresets(f)).toEqual([]);
  });
});
