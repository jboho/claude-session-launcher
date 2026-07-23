import { describe, expect, test } from "vitest";
import { osaQuote, buildMacScript } from "./macos.js";

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
    expect(lines).toContain('    write text "claude --model opus"');
    expect(lines[lines.length - 1]).toBe("end tell");
  });

  test("Terminal: uses do script", () => {
    const lines = buildMacScript("claude", "Terminal");
    expect(lines[0]).toBe('tell application "Terminal"');
    expect(lines).toContain('  do script "claude"');
  });
});
