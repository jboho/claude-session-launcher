import { describe, expect, test } from "vitest";
import { osaQuote, buildMacScript, buildGhosttyArgs } from "./macos.js";

describe("osaQuote", () => {
  test("wraps in double quotes", () => {
    expect(osaQuote("claude --model opus")).toBe('"claude --model opus"');
  });
  test("escapes backslashes then double quotes", () => {
    expect(osaQuote('a"b\\c')).toBe('"a\\"b\\\\c"');
  });
});

describe("buildMacScript", () => {
  test("iTerm: creates a window and writes the launch string", () => {
    const lines = buildMacScript("claude --model opus", "iTerm");
    expect(lines[0]).toBe('tell application "iTerm"');
    expect(lines).toContain('  tell targetSession to write text "claude --model opus"');
    expect(lines[lines.length - 1]).toBe("end tell");
  });

  // Regression: re-deriving `current window` after `activate` raced with iTerm's cold
  // start and failed with "Can't get current window. (-1728)". The session must be
  // reached through the window/tab that `create …` returned instead.
  test("iTerm: never reads `current window` after creating a window or tab", () => {
    const script = buildMacScript("claude", "iTerm").join("\n");
    expect(script).toContain("set newWindow to (create window with default profile)");
    expect(script).toContain("set targetSession to current session of newWindow");
    expect(script).toContain("tell targetWindow to set newTab to (create tab with default profile)");
    expect(script).not.toContain("current session of current window");
    // `current window` may only be read defensively, guarded by try, before creating.
    const afterCreate = script.slice(script.indexOf("create window with default profile"));
    expect(afterCreate).not.toContain("current window");
  });

  // Regression: `create tab with default profile` returns `missing value` (no error) when
  // the target window is hidden/minimized, so a failed tab must fall through to a new window.
  test("iTerm: falls back to a new window when the tab is not created", () => {
    const script = buildMacScript("claude", "iTerm").join("\n");
    expect(script).toContain("if newTab is not missing value then set targetSession to current session of newTab");
    expect(script).toContain("if targetSession is missing value then");
    expect(script).toContain('if newWindow is missing value then error "iTerm could not open a new window."');
  });

  test("Terminal: uses do script", () => {
    const lines = buildMacScript("claude", "Terminal");
    expect(lines[0]).toBe('tell application "Terminal"');
    expect(lines).toContain('  do script "claude"');
  });
});

describe("buildGhosttyArgs", () => {
  test("wraps the launch string as a single zsh -lc arg", () => {
    expect(buildGhosttyArgs("cd -- '~/Code' && claude")).toEqual([
      "-na",
      "Ghostty",
      "--args",
      "-e",
      "/bin/zsh",
      "-lc",
      "cd -- '~/Code' && claude",
    ]);
  });
});
