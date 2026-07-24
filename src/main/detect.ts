import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildDetectArgv } from "../core/claude-binary.js";

const execFileP = promisify(execFile);

export type Exec = (cmd: string, args: string[]) => Promise<{ stdout: string }>;
const defaultExec: Exec = (cmd, args) => execFileP(cmd, args);

export interface ClaudeDetectResult {
  found: boolean;
  path?: string;
}

/** Detect `claude` via a login shell (matches the terminal's PATH). Never throws. */
export async function detectClaude(
  shell: string | undefined = process.env.SHELL,
  exec: Exec = defaultExec,
): Promise<ClaudeDetectResult> {
  const [cmd, ...args] = buildDetectArgv(shell);
  try {
    const { stdout } = await exec(cmd, args);
    const path = stdout.trim().split("\n")[0]?.trim() ?? "";
    return path ? { found: true, path } : { found: false };
  } catch {
    return { found: false };
  }
}

/** macOS terminal candidates. Apple Terminal ships with the OS, so it is always present. */
export const TERMINAL_CANDIDATES = ["iTerm", "Terminal", "Ghostty"];

/** Return the installed subset of TERMINAL_CANDIDATES (probed via `open -Ra <name>`). */
export async function detectTerminals(exec: Exec = defaultExec): Promise<string[]> {
  const installed: string[] = [];
  for (const name of TERMINAL_CANDIDATES) {
    if (name === "Terminal") {
      installed.push(name);
      continue;
    }
    try {
      await exec("open", ["-Ra", name]);
      installed.push(name);
    } catch {
      /* not installed — skip */
    }
  }
  return installed;
}
