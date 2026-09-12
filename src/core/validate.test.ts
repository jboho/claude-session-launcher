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

  test("dontAsk is now a known mode", () => {
    expect(validatePreset(preset({ name: "x", mode: "dontAsk" })).valid).toBe(true);
  });

  test("a branch-like worktree name passes but a leading-dash one is rejected", () => {
    expect(validatePreset(preset({ name: "x", worktreeName: "feat/foo-bar" })).valid).toBe(true);
    const r = validatePreset(preset({ name: "x", worktreeName: "-rf" }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("worktree"))).toBe(true);
  });

  test("output style must stay within the JSON-safe charset", () => {
    expect(validatePreset(preset({ name: "x", outputStyle: "My Style-1" })).valid).toBe(true);
    expect(validatePreset(preset({ name: "x", outputStyle: 'a"}; rm -rf /' })).valid).toBe(false);
  });

  test("thinking budget must be digits only", () => {
    expect(validatePreset(preset({ name: "x", thinkingBudget: "0" })).valid).toBe(true);
    expect(validatePreset(preset({ name: "x", thinkingBudget: "1k" })).valid).toBe(false);
  });
});

describe("isValidModelValue", () => {
  test("accepts aliases, dated ids, and bracket context-variants", () => {
    expect(isValidModelValue("opus")).toBe(true);
    expect(isValidModelValue("claude-sonnet-4-5-20250929")).toBe(true);
    expect(isValidModelValue("fable")).toBe(true);
    expect(isValidModelValue("claude-opus-4-8[1m]")).toBe(true); // 1M context variant
    expect(isValidModelValue("  opus  ")).toBe(true); // trimmed before validating
  });
  test("rejects empty and shell-metacharacter values", () => {
    expect(isValidModelValue("")).toBe(false);
    expect(isValidModelValue("   ")).toBe(false);
    expect(isValidModelValue("opus; rm -rf ~")).toBe(false);
    expect(isValidModelValue("-rf")).toBe(false); // would reach the CLI as a flag, not a value
    expect(isValidModelValue("--dangerously-skip-permissions")).toBe(false);
    expect(isValidModelValue("opus$(whoami)")).toBe(false);
    // Bare chars trail a metachar — anchoring at BOTH ends must reject this.
    expect(isValidModelValue("evil opus")).toBe(false);
  });
});
