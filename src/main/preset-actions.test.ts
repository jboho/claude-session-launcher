import { afterEach, describe, expect, test } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { upsertPreset, removePreset } from "./preset-actions.js";
import { emptyPreset } from "../core/types.js";

const dirs: string[] = [];
async function tmpFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "csl-act-"));
  dirs.push(dir);
  return path.join(dir, "presets.json");
}
afterEach(async () => { for (const d of dirs.splice(0)) await fs.rm(d, { recursive: true, force: true }); });

describe("preset-actions", () => {
  test("upsert with no id creates and assigns an id", async () => {
    const f = await tmpFile();
    const list = await upsertPreset({ ...emptyPreset(), name: "New" }, f);
    expect(list).toHaveLength(1);
    expect(list[0].id).not.toBe("");
  });

  test("upsert with an existing id updates in place", async () => {
    const f = await tmpFile();
    const first = await upsertPreset({ ...emptyPreset(), name: "A" }, f);
    const id = first[0].id;
    const list = await upsertPreset({ ...first[0], name: "A2" }, f);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, name: "A2" });
  });

  test("remove deletes by id", async () => {
    const f = await tmpFile();
    const first = await upsertPreset({ ...emptyPreset(), name: "A" }, f);
    const list = await removePreset(first[0].id, f);
    expect(list).toEqual([]);
  });
});
