import { shellQuote, psQuote } from "./launch-string.js";

/** The token to use in place of `claude` in the launch string: a quoted path, or bare `claude`. */
export function resolveClaudeCommand(binary: string): string {
  const b = binary.trim();
  return b ? shellQuote(b) : "claude";
}

/** Windows (PowerShell) form: a ps-quoted path, or bare `claude`. */
export function resolveClaudeCommandWin(binary: string): string {
  const b = binary.trim();
  return b ? psQuote(b) : "claude";
}

/** Login-shell argv that reports the claude path if present — matches the terminal's PATH. */
export function buildDetectArgv(shell?: string): string[] {
  const sh = shell?.trim() || "/bin/zsh";
  return [sh, "-lc", "command -v claude"];
}
