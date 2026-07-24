import { describe, expect, test, vi } from "vitest";
import { detectClaude, detectTerminals, TERMINAL_CANDIDATES } from "./detect.js";

describe("detectClaude", () => {
  test("found when the shell prints a path", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: "/Users/me/.local/bin/claude\n" });
    expect(await detectClaude("/bin/zsh", exec)).toEqual({ found: true, path: "/Users/me/.local/bin/claude" });
    expect(exec).toHaveBeenCalledWith("/bin/zsh", ["-lc", "command -v claude"]);
  });
  test("not found when output is empty", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: "\n" });
    expect(await detectClaude("/bin/zsh", exec)).toEqual({ found: false });
  });
  test("not found (never throws) when the shell errors", async () => {
    const exec = vi.fn().mockRejectedValue(new Error("exit 1"));
    expect(await detectClaude("/bin/zsh", exec)).toEqual({ found: false });
  });
});

describe("detectTerminals", () => {
  test("Terminal is always present; others gated on `open -Ra` success", async () => {
    const exec = vi.fn().mockImplementation((_cmd: string, args: string[]) =>
      args[1] === "iTerm" ? Promise.resolve({ stdout: "" }) : Promise.reject(new Error("not installed")),
    );
    const found = await detectTerminals(exec);
    expect(found).toContain("Terminal");
    expect(found).toContain("iTerm");
    expect(found).not.toContain("Ghostty");
  });
  test("candidate list is iTerm, Terminal, Ghostty", () => {
    expect(TERMINAL_CANDIDATES).toEqual(["iTerm", "Terminal", "Ghostty"]);
  });
});
