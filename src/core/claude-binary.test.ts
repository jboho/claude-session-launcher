import { describe, expect, test } from "vitest";
import { resolveClaudeCommand, buildDetectArgv } from "./claude-binary.js";

describe("resolveClaudeCommand", () => {
  test("blank -> bare claude", () => {
    expect(resolveClaudeCommand("")).toBe("claude");
    expect(resolveClaudeCommand("   ")).toBe("claude");
  });
  test("a path is single-quoted (handles spaces)", () => {
    expect(resolveClaudeCommand("/opt/my tools/claude")).toBe("'/opt/my tools/claude'");
  });
});

describe("buildDetectArgv", () => {
  test("uses the given login shell", () => {
    expect(buildDetectArgv("/bin/bash")).toEqual(["/bin/bash", "-lc", "command -v claude"]);
  });
  test("falls back to /bin/zsh when shell is blank/undefined", () => {
    expect(buildDetectArgv(undefined)).toEqual(["/bin/zsh", "-lc", "command -v claude"]);
    expect(buildDetectArgv("")).toEqual(["/bin/zsh", "-lc", "command -v claude"]);
  });
  test("trims whitespace-padded shell", () => {
    expect(buildDetectArgv("  /bin/bash  ")).toEqual(["/bin/bash", "-lc", "command -v claude"]);
  });
});
