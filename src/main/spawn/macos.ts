import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

/** Escape a string for use as an AppleScript double-quoted literal. */
export function osaQuote(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Build the AppleScript (as -e lines) that opens a terminal running the launch string. */
export function buildMacScript(launchString: string, terminalApp: string): string[] {
  if (terminalApp === "Terminal") {
    return ['tell application "Terminal"', "  activate", `  do script ${osaQuote(launchString)}`, "end tell"];
  }
  // Default: iTerm — open a new tab in the current window, or a new window if none.
  //
  // Two iTerm quirks make the obvious script unreliable, both verified against iTerm 3.x:
  //  1. `current window` is `missing value` when iTerm has no key window (cold start, or
  //     coming forward right after `activate`) — reading it fails with "Can't get current
  //     window. (-1728)". So never re-derive it after creating; use what `create …` returns.
  //  2. `create tab with default profile` returns `missing value` (it does not error) when
  //     the target window is hidden or minimized, so the tab path can fail even with a
  //     perfectly valid window reference.
  // Hence: attempt the tab, and treat anything that does not yield a session as "open a
  // new window" rather than trusting either reference.
  return [
    'tell application "iTerm"',
    "  activate",
    "  set targetSession to missing value",
    "  try",
    "    set targetWindow to current window",
    "    if targetWindow is not missing value then",
    "      tell targetWindow to set newTab to (create tab with default profile)",
    "      if newTab is not missing value then set targetSession to current session of newTab",
    "    end if",
    "  end try",
    "  if targetSession is missing value then",
    "    set newWindow to (create window with default profile)",
    '    if newWindow is missing value then error "iTerm could not open a new window."',
    "    set targetSession to current session of newWindow",
    "  end if",
    `  tell targetSession to write text ${osaQuote(launchString)}`,
    "end tell",
  ];
}

/** `open -na Ghostty --args -e /bin/zsh -lc "<launchString>"` runs the command in a new Ghostty window. */
export function buildGhosttyArgs(launchString: string): string[] {
  return ["-na", "Ghostty", "--args", "-e", "/bin/zsh", "-lc", launchString];
}

export async function launchMac(launchString: string, terminalApp = "iTerm"): Promise<void> {
  if (terminalApp === "Ghostty") {
    // Ghostty has no AppleScript surface; launch via `open` with its CLI args.
    await execFileP("open", buildGhosttyArgs(launchString));
    return;
  }
  const args: string[] = [];
  for (const line of buildMacScript(launchString, terminalApp)) {
    args.push("-e", line);
  }
  await execFileP("osascript", args);
}
