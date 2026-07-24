import type { LaunchSpec } from "./types.js";

/** POSIX single-quote a string so the receiving shell treats it literally. */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Build the shell command written into the terminal to start the session.
 * @param claudeCmd The claude invocation token, inserted verbatim (NOT re-quoted here).
 *   Callers must pass a shell-safe token — use resolveClaudeCommand() to prepare it.
 */
export function buildLaunchString(spec: LaunchSpec, claudeCmd = "claude"): string {
  const parts = [claudeCmd];
  if (spec.model.trim()) parts.push("--model", spec.model.trim());
  if (spec.mode.trim()) parts.push("--permission-mode", spec.mode.trim());
  if (spec.effort.trim()) parts.push("--effort", spec.effort.trim());
  if (spec.cmd.trim()) parts.push(shellQuote(spec.cmd.trim()));
  const claudeInvocation = parts.join(" ");
  return spec.wd.trim() ? `cd ${shellQuote(spec.wd.trim())} && ${claudeInvocation}` : claudeInvocation;
}
