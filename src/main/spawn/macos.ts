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
  return [
    'tell application "iTerm"',
    "  activate",
    "  if (count of windows) = 0 then",
    "    create window with default profile",
    "  else",
    "    tell current window to create tab with default profile",
    "  end if",
    "  tell current session of current window",
    `    write text ${osaQuote(launchString)}`,
    "  end tell",
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
