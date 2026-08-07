import { describe, expect, test } from "vitest";
import { validatePreset, isValidModelValue } from "./validate.js";
import { emptyPreset } from "./types.js";

const preset = (over = {}) => ({ ...emptyPreset(), ...over });

describe("validatePreset", () => {
  test("blank name is invalid", () => {
    const r = validatePreset(preset({ name: "   " }));
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("Name is required.");
  });

  test("named preset with empty dials is valid", () => {
    expect(validatePreset(preset({ name: "Plain" })).valid).toBe(true);
  });

  test("unknown mode is rejected", () => {
    const r = validatePreset(preset({ name: "x", mode: "nope" }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("mode"))).toBe(true);
  });

  test("unknown effort is rejected", () => {
    const r = validatePreset(preset({ name: "x", effort: "turbo" }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("effort"))).toBe(true);
  });

  test("known dial values pass", () => {
    expect(validatePreset(preset({ name: "x", model: "opus", mode: "auto", effort: "high" })).valid).toBe(true);
  });
});

describe("isValidModelValue", () => {
  test("accepts aliases and dated ids", () => {
    expect(isValidModelValue("opus")).toBe(true);
    expect(isValidModelValue("claude-sonnet-4-5-20250929")).toBe(true);
    expect(isValidModelValue("fable")).toBe(true);
  });
  test("rejects empty and shell-metacharacter values", () => {
    expect(isValidModelValue("")).toBe(false);
    expect(isValidModelValue("   ")).toBe(false);
    expect(isValidModelValue("opus; rm -rf ~")).toBe(false);
    expect(isValidModelValue("opus[1m]")).toBe(false); // brackets deferred (see spec)
    expect(isValidModelValue("-rf")).toBe(false); // would reach the CLI as a flag, not a value
    expect(isValidModelValue("--dangerously-skip-permissions")).toBe(false);
  });
});
