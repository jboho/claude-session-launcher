import { describe, expect, test } from "vitest";
import { buildWtArgs } from "./windows.js";

describe("buildWtArgs", () => {
  test("opens a new pwsh tab in the current window running the launch string", () => {
    expect(buildWtArgs("Set-Location 'C:\\Code'; claude --model opus")).toEqual([
      "-w",
      "0",
      "new-tab",
      "pwsh",
      "-NoExit",
      "-Command",
      "Set-Location 'C:\\Code'; claude --model opus",
    ]);
  });

  test("honors an alternate shell (e.g. powershell)", () => {
    expect(buildWtArgs("claude", "powershell")).toEqual([
      "-w",
      "0",
      "new-tab",
      "powershell",
      "-NoExit",
      "-Command",
      "claude",
    ]);
  });
});
