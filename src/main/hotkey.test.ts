import { describe, expect, test } from "vitest";
import { hotkeyCandidates, defaultHotkey, DEFAULT_HOTKEY, DEFAULT_HOTKEY_WIN } from "./hotkey.js";

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
  test("uses the platform default (win32) when explicitly given", () => {
    expect(hotkeyCandidates("", "", "win32")).toEqual([DEFAULT_HOTKEY_WIN]);
    expect(hotkeyCandidates("Control+Shift+X", "", "win32")).toEqual(["Control+Shift+X", DEFAULT_HOTKEY_WIN]);
  });
});

describe("defaultHotkey", () => {
  test("darwin -> Alt+W", () => {
    expect(defaultHotkey("darwin")).toBe(DEFAULT_HOTKEY);
    expect(DEFAULT_HOTKEY).toBe("Alt+W");
  });
  test("win32 -> Control+Alt+C (Alt+W is poor on Windows)", () => {
    expect(defaultHotkey("win32")).toBe(DEFAULT_HOTKEY_WIN);
    expect(DEFAULT_HOTKEY_WIN).toBe("Control+Alt+C");
  });
});
