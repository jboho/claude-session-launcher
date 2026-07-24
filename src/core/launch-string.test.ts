import { describe, expect, test } from "vitest";
import { buildLaunchString, shellQuote, psQuote, buildWinLaunchString } from "./launch-string.js";
import type { LaunchSpec } from "./types.js";

const spec = (over: Partial<LaunchSpec> = {}): LaunchSpec => ({
  model: "", mode: "", effort: "", wd: "", cmd: "", ...over,
});

describe("shellQuote", () => {
  test("wraps in single quotes", () => {
    expect(shellQuote("/Users/me/Code")).toBe("'/Users/me/Code'");
  });
  test("escapes embedded single quotes", () => {
    expect(shellQuote("a'b")).toBe("'a'\\''b'");
  });
});

describe("buildLaunchString", () => {
  test("all dials empty -> bare claude", () => {
    expect(buildLaunchString(spec())).toBe("claude");
  });

  test("full spec assembles flags in order with cd", () => {
    expect(buildLaunchString(spec({ model: "opus", mode: "auto", effort: "high", wd: "~/Code", cmd: "/pr-queue" })))
      .toBe("cd '~/Code' && claude --model opus --permission-mode auto --effort high '/pr-queue'");
  });

  test("omits unset dials", () => {
    expect(buildLaunchString(spec({ model: "sonnet", effort: "low" })))
      .toBe("claude --model sonnet --effort low");
  });

  test("quotes a working directory containing spaces", () => {
    expect(buildLaunchString(spec({ model: "opus", wd: "/Users/me/My Code" })))
      .toBe("cd '/Users/me/My Code' && claude --model opus");
  });

  test("uses a supplied claude command token in place of bare claude", () => {
    expect(buildLaunchString(spec({ model: "opus", wd: "~/Code" }), "'/opt/tools/claude'"))
      .toBe("cd '~/Code' && '/opt/tools/claude' --model opus");
  });

  test("defaults to bare claude when no token is given", () => {
    expect(buildLaunchString(spec({ model: "sonnet" }))).toBe("claude --model sonnet");
  });
});

describe("psQuote", () => {
  test("wraps in single quotes", () => {
    expect(psQuote("C:\\Users\\me\\Code")).toBe("'C:\\Users\\me\\Code'");
  });
  test("escapes embedded single quotes by doubling", () => {
    expect(psQuote("a'b")).toBe("'a''b'");
  });
});

describe("buildWinLaunchString", () => {
  test("all dials empty -> bare claude", () => {
    expect(buildWinLaunchString(spec())).toBe("claude");
  });

  test("full spec assembles flags in order with Set-Location and ; sequencing", () => {
    expect(buildWinLaunchString(spec({ model: "opus", mode: "auto", effort: "high", wd: "C:\\Code", cmd: "/pr-queue" })))
      .toBe("Set-Location 'C:\\Code'; claude --model opus --permission-mode auto --effort high '/pr-queue'");
  });

  test("omits unset dials", () => {
    expect(buildWinLaunchString(spec({ model: "sonnet", effort: "low" })))
      .toBe("claude --model sonnet --effort low");
  });

  test("ps-quotes a working directory containing spaces", () => {
    expect(buildWinLaunchString(spec({ model: "opus", wd: "C:\\My Code" })))
      .toBe("Set-Location 'C:\\My Code'; claude --model opus");
  });

  test("uses a supplied claude command token in place of bare claude", () => {
    expect(buildWinLaunchString(spec({ model: "opus", wd: "C:\\Code" }), "'C:\\Program Files\\claude.exe'"))
      .toBe("Set-Location 'C:\\Code'; 'C:\\Program Files\\claude.exe' --model opus");
  });
});
