import { describe, expect, test, vi } from "vitest";
import { launchSpec } from "./index.js";
import type { LaunchSpec, Settings } from "../../core/types.js";

const spec: LaunchSpec = { model: "opus", mode: "auto", effort: "high", wd: "~/Code", cmd: "" };
const settings: Settings = { terminal: "iTerm", wd: "", cmd: "", claudeBinary: "", models: [], hotkey: "" };

describe("launchSpec", () => {
  test("on darwin, calls the mac launcher with the built string and terminal", async () => {
    const launchMac = vi.fn().mockResolvedValue(undefined);
    await launchSpec(spec, settings, { platform: "darwin", launchMac });
    expect(launchMac).toHaveBeenCalledWith(
      "cd '~/Code' && claude --model opus --permission-mode auto --effort high",
      "iTerm",
    );
  });

  test("on an unsupported platform (linux), throws a clear not-implemented error", async () => {
    await expect(launchSpec(spec, settings, { platform: "linux" })).rejects.toThrow(/not implemented on this platform/);
  });

  test("on win32, calls the windows launcher with the PowerShell launch string", async () => {
    const launchWin = vi.fn().mockResolvedValue(undefined);
    const winSpec: LaunchSpec = { model: "opus", mode: "auto", effort: "high", wd: "C:\\Code", cmd: "" };
    await launchSpec(winSpec, settings, { platform: "win32", launchWin });
    expect(launchWin).toHaveBeenCalledWith(
      "Set-Location 'C:\\Code'; claude --model opus --permission-mode auto --effort high",
    );
  });

  test("win32 still enforces the safe-dial guard and does not launch", async () => {
    const launchWin = vi.fn().mockResolvedValue(undefined);
    const evil: LaunchSpec = { ...spec, model: "opus; rm -rf ~" };
    await expect(launchSpec(evil, settings, { platform: "win32", launchWin })).rejects.toThrow(/[Uu]nsafe model/);
    expect(launchWin).not.toHaveBeenCalled();
  });

  test("rejects a model containing shell metacharacters and does not launch", async () => {
    const launchMac = vi.fn().mockResolvedValue(undefined);
    const evil: LaunchSpec = { ...spec, model: "opus; rm -rf ~" };
    await expect(launchSpec(evil, settings, { platform: "darwin", launchMac })).rejects.toThrow(/[Uu]nsafe model/);
    expect(launchMac).not.toHaveBeenCalled();
  });

  test("allows a real hyphenated/dotted model id", async () => {
    const launchMac = vi.fn().mockResolvedValue(undefined);
    const ok: LaunchSpec = { ...spec, model: "claude-haiku-4-5-20251001", wd: "", cmd: "" };
    await launchSpec(ok, settings, { platform: "darwin", launchMac });
    expect(launchMac).toHaveBeenCalledWith(
      "claude --model claude-haiku-4-5-20251001 --permission-mode auto --effort high",
      "iTerm",
    );
  });

  test("uses the configured claude binary path (quoted) in the launch string", async () => {
    const launchMac = vi.fn().mockResolvedValue(undefined);
    const withBinary: Settings = { ...settings, claudeBinary: "/opt/my tools/claude" };
    const ok: LaunchSpec = { ...spec, wd: "", cmd: "" };
    await launchSpec(ok, withBinary, { platform: "darwin", launchMac });
    expect(launchMac).toHaveBeenCalledWith(
      "'/opt/my tools/claude' --model opus --permission-mode auto --effort high",
      "iTerm",
    );
  });
});
