import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

/**
 * Windows Terminal argv to open a new PowerShell tab in the current window running the
 * launch string. `-w 0 new-tab` targets the existing window (like iTerm's new-tab);
 * `<shell> -NoExit -Command <launchString>` runs the command and keeps the shell open.
 */
export function buildWtArgs(launchString: string, shell = "pwsh"): string[] {
  return ["-w", "0", "new-tab", shell, "-NoExit", "-Command", launchString];
}

/**
 * Launch on Windows via Windows Terminal (`wt`) running PowerShell.
 *
 * TODO(win): UNVERIFIED on a real Windows machine. The pure argv builder above is unit
 * tested, but the actual spawn — Windows Terminal availability, whether a visible window
 * opens, and how the launch string quotes through `wt` → pwsh — must be validated on
 * Windows before this path is considered working (see ROADMAP "#2 — Windows support").
 * A no-`wt` fallback (a visible Windows PowerShell window) also needs testing there; for
 * now we surface a clear, actionable error rather than shipping an unverified fallback.
 */
export async function launchWin(launchString: string): Promise<void> {
  try {
    await execFileP("wt", buildWtArgs(launchString));
  } catch (err) {
    throw new Error(
      `Could not launch via Windows Terminal (wt). Install Windows Terminal, or launch manually. ` +
        `(${err instanceof Error ? err.message : String(err)})`,
    );
  }
}
