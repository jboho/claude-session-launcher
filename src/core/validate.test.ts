import { describe, expect, test } from "vitest";
import { validatePreset } from "./validate.js";
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
