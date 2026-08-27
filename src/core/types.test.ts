import { describe, expect, test } from "vitest";
import { MODELS, MODES, EFFORTS, DEFAULT_SETTINGS, emptyPreset, capabilitiesFor, effectiveModels } from "./types.js";

describe("types", () => {
  test("dial option lists have the expected counts", () => {
    expect(MODELS.map((o) => o.value)).toEqual(["opus", "sonnet", "haiku", "fable"]);
    expect(MODES.map((o) => o.value)).toEqual(["plan", "auto", "acceptEdits", "dontAsk"]);
    expect(EFFORTS.map((o) => o.value)).toEqual(["low", "medium", "high", "xhigh", "max"]);
  });

  test("emptyPreset returns an all-blank preset", () => {
    expect(emptyPreset()).toEqual({
      id: "", name: "", model: "", mode: "", effort: "", wd: "", cmd: "",
      worktree: false, worktreeName: "", outputStyle: "", thinkingBudget: "",
    });
  });

  test("default settings target iTerm with no dir/cmd and empty generality fields", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      terminal: "iTerm", wd: "", cmd: "", claudeBinary: "", models: [], hotkey: "", forkSubagent: "",
    });
  });
});

describe("capabilitiesFor", () => {
  test("haiku 4.5 now accepts effort and the autonomous modes", () => {
    expect(capabilitiesFor("haiku")).toEqual({ effort: true, blockedModes: [], thinkingBudget: true });
    expect(capabilitiesFor("claude-haiku-4-5-20251001")).toEqual({ effort: true, blockedModes: [], thinkingBudget: true });
  });
  test("fable ignores the thinking budget", () => {
    expect(capabilitiesFor("fable")).toEqual({ effort: true, blockedModes: [], thinkingBudget: false });
    expect(capabilitiesFor("claude-fable-5")).toEqual({ effort: true, blockedModes: [], thinkingBudget: false });
  });
  test("opus/sonnet/custom are unrestricted and honor the thinking budget", () => {
    expect(capabilitiesFor("opus")).toEqual({ effort: true, blockedModes: [], thinkingBudget: true });
    expect(capabilitiesFor("claude-sonnet-4-5-20250929")).toEqual({ effort: true, blockedModes: [], thinkingBudget: true });
    expect(capabilitiesFor("some-future-model")).toEqual({ effort: true, blockedModes: [], thinkingBudget: true });
  });
});

describe("effectiveModels", () => {
  test("empty or non-array falls back to built-in MODELS", () => {
    expect(effectiveModels([])).toBe(MODELS);
    expect(effectiveModels(undefined)).toBe(MODELS);
    expect(effectiveModels("nope" as unknown as never)).toBe(MODELS);
  });
  test("non-empty custom list is returned as-is", () => {
    const custom = [{ value: "fable", label: "Fable" }];
    expect(effectiveModels(custom)).toBe(custom);
  });
});
