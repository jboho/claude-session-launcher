import { describe, expect, test } from "vitest";
import { normalizePreset } from "./normalize.js";

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
