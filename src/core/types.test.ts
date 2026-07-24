import { describe, expect, test } from "vitest";
import { MODELS, MODES, EFFORTS, DEFAULT_SETTINGS, emptyPreset } from "./types.js";

describe("types", () => {
  test("dial option lists have the expected counts", () => {
    expect(MODELS.map((o) => o.value)).toEqual(["opus", "sonnet", "haiku"]);
    expect(MODES.map((o) => o.value)).toEqual(["plan", "auto", "acceptEdits"]);
    expect(EFFORTS.map((o) => o.value)).toEqual(["low", "medium", "high", "xhigh", "max"]);
  });

  test("emptyPreset returns an all-blank preset", () => {
    expect(emptyPreset()).toEqual({ id: "", name: "", model: "", mode: "", effort: "", wd: "", cmd: "" });
  });

  test("default settings target iTerm with no dir/cmd and empty generality fields", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      terminal: "iTerm", wd: "", cmd: "", claudeBinary: "", models: [], hotkey: "",
    });
  });
});
