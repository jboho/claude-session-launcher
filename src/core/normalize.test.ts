import { describe, expect, test } from "vitest";
import { normalizePreset, normalizeSettings } from "./normalize.js";
import { DEFAULT_SETTINGS } from "./types.js";

describe("normalizePreset", () => {
  test("fills missing fields with blanks", () => {
    expect(normalizePreset({ name: "X" })).toEqual({ id: "", name: "X", model: "", mode: "", effort: "", wd: "", cmd: "" });
  });

  test("coerces non-string / null / undefined to blank", () => {
    expect(normalizePreset({ name: 42, model: null, wd: undefined })).toEqual(
      { id: "", name: "", model: "", mode: "", effort: "", wd: "", cmd: "" },
    );
  });

  test("passes through a well-formed preset", () => {
    const p = { id: "a", name: "PR", model: "opus", mode: "auto", effort: "high", wd: "~/Code", cmd: "/pr-queue" };
    expect(normalizePreset(p)).toEqual(p);
  });

  test("null/garbage input yields a blank preset", () => {
    expect(normalizePreset(null)).toEqual({ id: "", name: "", model: "", mode: "", effort: "", wd: "", cmd: "" });
  });
});

describe("normalizeSettings", () => {
  test("fills missing fields from the defaults", () => {
    expect(normalizeSettings({ terminal: "Ghostty" })).toEqual({ ...DEFAULT_SETTINGS, terminal: "Ghostty" });
  });

  test("coerces a non-string claudeBinary to blank", () => {
    // Left as-is this reaches resolveClaudeCommand(), which calls .trim() on it.
    expect(normalizeSettings({ claudeBinary: 42 }).claudeBinary).toBe("");
    expect(normalizeSettings({ claudeBinary: { path: "/x" } }).claudeBinary).toBe("");
    expect(normalizeSettings({ claudeBinary: ["/x"] }).claudeBinary).toBe("");
  });

  test("drops unknown keys instead of spreading them onto Settings", () => {
    expect(normalizeSettings({ terminal: "iTerm", evil: "payload" })).toEqual(DEFAULT_SETTINGS);
  });

  test("keeps only well-formed model entries", () => {
    expect(normalizeSettings({ models: [
      { value: "opus", label: "Opus" },
      { value: 1, label: "bad value" },
      { value: "sonnet" },
      "not an object",
      null,
    ] }).models).toEqual([{ value: "opus", label: "Opus" }, { value: "sonnet", label: "sonnet" }]);
  });

  test("models must be an array", () => {
    expect(normalizeSettings({ models: { value: "opus" } }).models).toEqual([]);
  });

  test("passes through well-formed settings", () => {
    const s = { terminal: "Terminal", wd: "~/Code", cmd: "/wrap", claudeBinary: "/usr/local/bin/claude",
      models: [{ value: "opus", label: "Opus" }], hotkey: "Alt+W" };
    expect(normalizeSettings(s)).toEqual(s);
  });

  test("null/garbage input yields the defaults", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("nope")).toEqual(DEFAULT_SETTINGS);
  });
});
