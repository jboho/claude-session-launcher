import type { LaunchSpec } from "./types.js";

/** POSIX single-quote a string so the receiving shell treats it literally. */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * A token safe to leave UNQUOTED in a command word. Excludes shell metacharacters —
 * notably the glob brackets in context-variant model ids like `claude-opus-4-8[1m]`,
 * which zsh (with NOMATCH) would try to expand and abort on.
 */
const BARE_TOKEN_RE = /^[A-Za-z0-9._-]+$/;

/** POSIX-quote `s` only when it isn't a bare-safe token (keeps plain model ids unquoted). */
export function shellQuoteIfNeeded(s: string): string {
  return BARE_TOKEN_RE.test(s) ? s : shellQuote(s);
}

/** PowerShell-quote `s` only when it isn't a bare-safe token. */
export function psQuoteIfNeeded(s: string): string {
  return BARE_TOKEN_RE.test(s) ? s : psQuote(s);
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
  if (spec.model.trim()) parts.push("--model", shellQuoteIfNeeded(spec.model.trim()));
  if (spec.worktree) {
    parts.push("--worktree");
    if (spec.worktreeName.trim()) parts.push(shellQuoteIfNeeded(spec.worktreeName.trim()));
  }
  if (spec.mode.trim()) parts.push("--permission-mode", spec.mode.trim());
  if (spec.effort.trim()) parts.push("--effort", spec.effort.trim());
  if (spec.outputStyle.trim()) {
    parts.push("--settings", shellQuote(JSON.stringify({ outputStyle: spec.outputStyle.trim() })));
  }
  if (spec.cmd.trim()) parts.push("--", shellQuote(spec.cmd.trim()));
  // Thinking budget scopes to the claude process: sits after `cd && `, before `claude`.
  const tb = spec.thinkingBudget.trim();
  const env = tb ? `MAX_THINKING_TOKENS=${shellQuoteIfNeeded(tb)} ` : "";
  const claudeInvocation = env + parts.join(" ");
  return spec.wd.trim() ? `cd -- ${shellQuote(spec.wd.trim())} && ${claudeInvocation}` : claudeInvocation;
}

/** PowerShell single-quote a string (escape `'` by doubling) so the shell treats it literally. */
export function psQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/**
 * Windows (PowerShell) form of the launch command. PowerShell sequences with `;` and
 * uses `Set-Location` — the POSIX `cd '…' && …` form is invalid there. Mode/effort go in
 * unquoted (SAFE_DIAL-guarded upstream, like the POSIX builder); the model is ps-quoted
 * only if it isn't a bare token (e.g. a `[1m]` context variant); wd/cmd are ps-quoted.
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
  if (spec.model.trim()) parts.push("--model", psQuoteIfNeeded(spec.model.trim()));
  if (spec.worktree) {
    parts.push("--worktree");
    if (spec.worktreeName.trim()) parts.push(psQuoteIfNeeded(spec.worktreeName.trim()));
  }
  if (spec.mode.trim()) parts.push("--permission-mode", spec.mode.trim());
  if (spec.effort.trim()) parts.push("--effort", spec.effort.trim());
  if (spec.outputStyle.trim()) {
    parts.push("--settings", psQuote(JSON.stringify({ outputStyle: spec.outputStyle.trim() })));
  }
  if (spec.cmd.trim()) parts.push("--", psQuote(spec.cmd.trim()));
  // PowerShell scopes an env var with `$env:`; harmless in a fresh session.
  const tb = spec.thinkingBudget.trim();
  const env = tb ? `$env:MAX_THINKING_TOKENS=${psQuoteIfNeeded(tb)}; ` : "";
  const claudeInvocation = env + parts.join(" ");
  return spec.wd.trim()
    ? `Set-Location -LiteralPath ${psQuote(spec.wd.trim())}; ${claudeInvocation}`
    : claudeInvocation;
}
