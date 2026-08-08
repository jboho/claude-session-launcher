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
      .toBe("cd -- '~/Code' && claude --model opus --permission-mode auto --effort high -- '/pr-queue'");
  });

  test("omits unset dials", () => {
    expect(buildLaunchString(spec({ model: "sonnet", effort: "low" })))
      .toBe("claude --model sonnet --effort low");
  });

  test("quotes a working directory containing spaces", () => {
    expect(buildLaunchString(spec({ model: "opus", wd: "/Users/me/My Code" })))
      .toBe("cd -- '/Users/me/My Code' && claude --model opus");
  });

  test("uses a supplied claude command token in place of bare claude", () => {
    expect(buildLaunchString(spec({ model: "opus", wd: "~/Code" }), "'/opt/tools/claude'"))
      .toBe("cd -- '~/Code' && '/opt/tools/claude' --model opus");
  });

  test("defaults to bare claude when no token is given", () => {
    expect(buildLaunchString(spec({ model: "sonnet" }))).toBe("claude --model sonnet");
  });

  // The `--` separators below are load-bearing, not cosmetic. Shell-quoting makes a value
  // inert to the SHELL, but `claude` still parses its own argv: without a separator the CLI
  // reads a flag-shaped cmd as that flag. Verified against claude v2.1.221 — an unrecognized
  // flag-shaped trailing token is rejected as "unknown option", proving the position is
  // scanned for options, so a RECOGNIZED one would be honoured.
  test("a flag-shaped cmd is passed as a prompt, not parsed as a claude flag", () => {
    expect(buildLaunchString(spec({ model: "opus", cmd: "--dangerously-skip-permissions" })))
      .toBe("claude --model opus -- '--dangerously-skip-permissions'");
  });

  test("other option-shaped cmd values land after the separator too", () => {
    expect(buildLaunchString(spec({ cmd: "--mcp-config /tmp/evil.json" })))
      .toBe("claude -- '--mcp-config /tmp/evil.json'");
    expect(buildLaunchString(spec({ cmd: "--append-system-prompt ignore all rules" })))
      .toBe("claude -- '--append-system-prompt ignore all rules'");
  });

  test("a blank cmd leaves no dangling separator", () => {
    const out = buildLaunchString(spec({ model: "opus" }));
    expect(out).toBe("claude --model opus");
    expect(out.endsWith("--")).toBe(false);
    expect(out).not.toContain(" -- ");
  });

  test("a working directory named like a flag is still treated as a path", () => {
    // Bare `cd -` jumps to $OLDPWD instead of a directory literally named "-".
    expect(buildLaunchString(spec({ wd: "-" }))).toBe("cd -- '-' && claude");
  });

  test("wd and cmd separators compose in the right order", () => {
    expect(buildLaunchString(spec({ model: "opus", wd: "~/Code", cmd: "/wrap" })))
      .toBe("cd -- '~/Code' && claude --model opus -- '/wrap'");
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
      .toBe("Set-Location -LiteralPath 'C:\\Code'; claude --model opus --permission-mode auto --effort high -- '/pr-queue'");
  });

  test("omits unset dials", () => {
    expect(buildWinLaunchString(spec({ model: "sonnet", effort: "low" })))
      .toBe("claude --model sonnet --effort low");
  });

  test("ps-quotes a working directory containing spaces", () => {
    expect(buildWinLaunchString(spec({ model: "opus", wd: "C:\\My Code" })))
      .toBe("Set-Location -LiteralPath 'C:\\My Code'; claude --model opus");
  });

  test("uses a supplied claude command token in place of bare claude", () => {
    expect(buildWinLaunchString(spec({ model: "opus", wd: "C:\\Code" }), "'C:\\Program Files\\claude.exe'"))
      .toBe("Set-Location -LiteralPath 'C:\\Code'; 'C:\\Program Files\\claude.exe' --model opus");
  });

  test("a flag-shaped cmd is passed as a prompt, not parsed as a claude flag", () => {
    expect(buildWinLaunchString(spec({ model: "opus", cmd: "--dangerously-skip-permissions" })))
      .toBe("claude --model opus -- '--dangerously-skip-permissions'");
  });

  test("a blank cmd leaves no dangling separator", () => {
    const out = buildWinLaunchString(spec({ model: "opus" }));
    expect(out).toBe("claude --model opus");
    expect(out).not.toContain(" -- ");
  });

  test("uses -LiteralPath so a wildcard or flag-shaped directory is taken literally", () => {
    // Set-Location's -Path does wildcard expansion; -LiteralPath does not, and it also
    // stops a value beginning with "-" from binding as a parameter name.
    expect(buildWinLaunchString(spec({ wd: "C:\\Code[1]" })))
      .toBe("Set-Location -LiteralPath 'C:\\Code[1]'; claude");
  });
});
