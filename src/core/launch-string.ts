import type { LaunchSpec } from "./types.js";

/** POSIX single-quote a string so the receiving shell treats it literally. */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Build the shell command written into the terminal to start the session.
 *
 * Both `--` separators are load-bearing; do not remove them.
 *
 * Shell-quoting makes a value inert to the SHELL, but `claude` still parses its own argv:
 * without a separator the CLI reads a flag-shaped cmd as that flag, so a hand-edited or
 * dotfile-synced presets.json with `"cmd": "--dangerously-skip-permissions"` would escalate
 * permissions rather than send a prompt. `cd --` likewise stops a directory named `-` from
 * being read as cd's own "previous directory" argument.
 *
 * @param claudeCmd The claude invocation token, inserted verbatim (NOT re-quoted here).
 *   Callers must pass a shell-safe token — use resolveClaudeCommand() to prepare it.
 */
export function buildLaunchString(spec: LaunchSpec, claudeCmd = "claude"): string {
  const parts = [claudeCmd];
  if (spec.model.trim()) parts.push("--model", spec.model.trim());
  if (spec.mode.trim()) parts.push("--permission-mode", spec.mode.trim());
  if (spec.effort.trim()) parts.push("--effort", spec.effort.trim());
  if (spec.cmd.trim()) parts.push("--", shellQuote(spec.cmd.trim()));
  const claudeInvocation = parts.join(" ");
  return spec.wd.trim() ? `cd -- ${shellQuote(spec.wd.trim())} && ${claudeInvocation}` : claudeInvocation;
}

/** PowerShell single-quote a string (escape `'` by doubling) so the shell treats it literally. */
export function psQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/**
 * Windows (PowerShell) form of the launch command. PowerShell sequences with `;` and
 * uses `Set-Location` — the POSIX `cd '…' && …` form is invalid there. Dials go in
 * unquoted (SAFE_DIAL-guarded upstream, like the POSIX builder); wd/cmd are ps-quoted.
 *
 * Same `--` separator as the POSIX builder, for the same reason: it stops a flag-shaped
 * cmd from being parsed by `claude` as one of its own options. `-LiteralPath` is the
 * PowerShell counterpart to `cd --` — Set-Location's default `-Path` glob-expands and
 * would bind a value starting with `-` as a parameter name.
 *
 * @param claudeCmd inserted verbatim — use resolveClaudeCommandWin() to prepare it.
 */
export function buildWinLaunchString(spec: LaunchSpec, claudeCmd = "claude"): string {
  const parts = [claudeCmd];
  if (spec.model.trim()) parts.push("--model", spec.model.trim());
  if (spec.mode.trim()) parts.push("--permission-mode", spec.mode.trim());
  if (spec.effort.trim()) parts.push("--effort", spec.effort.trim());
  if (spec.cmd.trim()) parts.push("--", psQuote(spec.cmd.trim()));
  const claudeInvocation = parts.join(" ");
  return spec.wd.trim()
    ? `Set-Location -LiteralPath ${psQuote(spec.wd.trim())}; ${claudeInvocation}`
    : claudeInvocation;
}
