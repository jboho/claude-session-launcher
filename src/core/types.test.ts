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
      outputStyle: "", thinkingBudget: "",
    });
  });

  test("default settings target iTerm with no dir/cmd and empty generality fields", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      terminal: "iTerm", wd: "", cmd: "", claudeBinary: "", models: [], hotkey: "", forkSubagent: "",
    });
  });
});

describe("capabilitiesFor", () => {
  const caps = (thinkingBudget: boolean) => ({ effort: true, blockedModes: [], thinkingBudget });

  test("haiku 4.5 now accepts effort and the autonomous modes", () => {
    expect(capabilitiesFor("claude-haiku-4-5-20251001")).toEqual(caps(true));
  });
  // Measured on Claude Code 2.1.312: MAX_THINKING_TOKENS=0 removes the thinking block on these ids.
  test("older full model ids honor the thinking budget", () => {
    for (const m of [
      "claude-opus-4-8", "claude-opus-4-8[1m]", "claude-sonnet-4-6", "claude-sonnet-4-5-20250929",
      "claude-opus-4-20250514", "claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5-20251001",
    ]) expect(capabilitiesFor(m).thinkingBudget, m).toBe(true);
  });
  // Same probe: thinking stays on at MAX_THINKING_TOKENS=0 for the 5.5 generation and for Fable.
  test("the 5.5 models and fable ignore the thinking budget", () => {
    for (const m of [
      "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5[1m]",
      "claude-fable-5", "claude-fable-5-1", "fable",
    ]) expect(capabilitiesFor(m).thinkingBudget, m).toBe(false);
  });
  test("aliases and the CLI default resolve to the 5.5 models, so the dial is inert", () => {
    for (const m of ["opus", "sonnet", "haiku", "Opus", " opus ", ""]) {
      expect(capabilitiesFor(m).thinkingBudget, JSON.stringify(m)).toBe(false);
    }
  });
  test("an unrecognized model id does not claim the dial works", () => {
    expect(capabilitiesFor("some-future-model")).toEqual(caps(false));
    expect(capabilitiesFor("claude-opus-6")).toEqual(caps(false));
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
