import { describe, expect, test } from "vitest";
import { hotkeyCandidates, DEFAULT_HOTKEY } from "./hotkey.js";

describe("hotkeyCandidates", () => {
  test("blank preferred -> just the default", () => {
    expect(hotkeyCandidates("")).toEqual([DEFAULT_HOTKEY]);
    expect(hotkeyCandidates("   ")).toEqual([DEFAULT_HOTKEY]);
  });
  test("custom preferred first, then default", () => {
    expect(hotkeyCandidates("Control+Alt+C")).toEqual(["Control+Alt+C", DEFAULT_HOTKEY]);
  });
  test("de-duplicates when preferred equals the default", () => {
    expect(hotkeyCandidates("Alt+W")).toEqual(["Alt+W"]);
  });
});
