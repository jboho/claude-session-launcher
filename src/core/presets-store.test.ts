import { afterEach, describe, expect, test } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { configDir, loadPresets, savePresets, directoryExists } from "./presets-store.js";

const tmpFiles: string[] = [];
async function tmpFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "csl-"));
  const f = path.join(dir, "presets.json");
  tmpFiles.push(f);
  return f;
}
afterEach(async () => { for (const f of tmpFiles.splice(0)) await fs.rm(path.dirname(f), { recursive: true, force: true }); });

describe("configDir", () => {
  test("honors CLAUDE_LAUNCHER_CONFIG override (returns its dir)", () => {
    expect(configDir({ CLAUDE_LAUNCHER_CONFIG: "/x/y/presets.json" }, "/home")).toBe("/x/y");
  });
  test("posix uses XDG_CONFIG_HOME when set", () => {
    expect(configDir({ XDG_CONFIG_HOME: "/cfg" }, "/home", "linux")).toBe("/cfg/claude-launcher");
  });
  test("posix falls back to ~/.config", () => {
    expect(configDir({}, "/home/me", "darwin")).toBe("/home/me/.config/claude-launcher");
  });
  test("win32 uses APPDATA", () => {
    expect(configDir({ APPDATA: "C:\\Users\\me\\AppData\\Roaming" }, "C:\\Users\\me", "win32"))
      .toBe(path.win32.join("C:\\Users\\me\\AppData\\Roaming", "claude-launcher"));
  });
});

describe("loadPresets / savePresets", () => {
  test("missing file returns empty array", async () => {
    const f = await tmpFile();
    await fs.rm(f, { force: true });
    expect(await loadPresets(f)).toEqual([]);
  });

  test("save then load round-trips", async () => {
    const f = await tmpFile();
    const p = { id: "1", name: "PR", model: "opus", mode: "auto", effort: "high", wd: "~/Code", cmd: "/pr-queue" };
    await savePresets([p], f);
    expect(await loadPresets(f)).toEqual([p]);
  });

  test("backfills a missing id on load", async () => {
    const f = await tmpFile();
    await fs.writeFile(f, JSON.stringify([{ name: "no-id" }]), "utf8");
    const loaded = await loadPresets(f);
    expect(loaded[0].id).not.toBe("");
    expect(loaded[0].name).toBe("no-id");
  });

  test("invalid JSON throws (no silent empty)", async () => {
    const f = await tmpFile();
    await fs.writeFile(f, "{ not json", "utf8");
    await expect(loadPresets(f)).rejects.toThrow(/not valid JSON/);
  });

  test("non-array JSON throws", async () => {
    const f = await tmpFile();
    await fs.writeFile(f, JSON.stringify({ nope: true }), "utf8");
    await expect(loadPresets(f)).rejects.toThrow(/array/);
  });
});

describe("directoryExists", () => {
  test("true for a real dir, false otherwise", async () => {
    expect(await directoryExists(os.tmpdir())).toBe(true);
    expect(await directoryExists(path.join(os.tmpdir(), "definitely-not-here-csl"))).toBe(false);
  });
});
