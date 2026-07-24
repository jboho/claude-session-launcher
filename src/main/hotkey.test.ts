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
  test("includes the current binding as a fallback before the default", () => {
    expect(hotkeyCandidates("Control+Alt+C", "Control+Shift+K")).toEqual(["Control+Alt+C", "Control+Shift+K", DEFAULT_HOTKEY]);
  });
  test("dedups current against preferred and default", () => {
    expect(hotkeyCandidates("Alt+W", "Alt+W")).toEqual(["Alt+W"]);
  });
});
