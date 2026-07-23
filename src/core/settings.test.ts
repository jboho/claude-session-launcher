import { afterEach, describe, expect, test } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadSettings, saveSettings } from "./settings.js";
import { DEFAULT_SETTINGS } from "./types.js";

const dirs: string[] = [];
async function tmpFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "csl-set-"));
  dirs.push(dir);
  return path.join(dir, "settings.json");
}
afterEach(async () => { for (const d of dirs.splice(0)) await fs.rm(d, { recursive: true, force: true }); });

describe("settings", () => {
  test("missing file returns defaults", async () => {
    const f = await tmpFile();
    await fs.rm(f, { force: true });
    expect(await loadSettings(f)).toEqual(DEFAULT_SETTINGS);
  });

  test("partial file merges over defaults", async () => {
    const f = await tmpFile();
    await fs.writeFile(f, JSON.stringify({ wd: "~/Code" }), "utf8");
    expect(await loadSettings(f)).toEqual({ terminal: "iTerm", wd: "~/Code", cmd: "" });
  });

  test("save then load round-trips", async () => {
    const f = await tmpFile();
    const s = { terminal: "Terminal", wd: "/tmp", cmd: "/pr-queue" };
    await saveSettings(s, f);
    expect(await loadSettings(f)).toEqual(s);
  });

  test("invalid JSON throws (not swallowed to defaults)", async () => {
    const f = await tmpFile();
    await fs.writeFile(f, "{ not json", "utf8");
    await expect(loadSettings(f)).rejects.toThrow();
  });
});
