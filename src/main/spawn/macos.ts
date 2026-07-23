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
  // Default: iTerm
  return [
    'tell application "iTerm"',
    "  activate",
    "  set w to (create window with default profile)",
    "  tell current session of w",
    `    write text ${osaQuote(launchString)}`,
    "  end tell",
    "end tell",
  ];
}

export async function launchMac(launchString: string, terminalApp = "iTerm"): Promise<void> {
  const args: string[] = [];
  for (const line of buildMacScript(launchString, terminalApp)) {
    args.push("-e", line);
  }
  await execFileP("osascript", args);
}
