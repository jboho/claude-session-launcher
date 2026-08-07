import { buildLaunchString, buildWinLaunchString } from "../../core/launch-string.js";
import type { LaunchSpec, Settings } from "../../core/types.js";
import { resolveClaudeCommand, resolveClaudeCommandWin } from "../../core/claude-binary.js";
import { launchMac } from "./macos.js";
import { launchWin } from "./windows.js";

export type MacLauncher = (launchString: string, terminalApp?: string) => Promise<void>;
export type WinLauncher = (launchString: string) => Promise<void>;

/**
 * model/mode/effort are passed UNQUOTED into the shell command, so restrict them
 * to a safe charset — defense-in-depth against a hand-edited presets.json that
 * smuggles shell metacharacters through those dials. wd/cmd are single-quoted by
 * buildLaunchString and are intentionally NOT restricted (they legitimately hold
 * spaces, slashes, etc.).
 *
 * A leading `-` is rejected as well: no legitimate model, mode, or effort value starts
 * with one, and allowing it would leave the app depending on the external CLI's own
 * argument parsing to decide whether `--model -rf` is a value or a second flag.
 */
const SAFE_DIAL = /^(?!-)[A-Za-z0-9._-]*$/;

function assertSafeDial(name: string, value: string): void {
  if (!SAFE_DIAL.test(value)) {
    throw new Error(`Unsafe ${name} value: ${JSON.stringify(value)} — only letters, digits, '.', '-', '_' are allowed.`);
  }
}

export async function launchSpec(
  spec: LaunchSpec,
  settings: Settings,
  deps: { platform?: string; launchMac?: MacLauncher; launchWin?: WinLauncher } = {},
): Promise<void> {
  assertSafeDial("model", spec.model);
  assertSafeDial("mode", spec.mode);
  assertSafeDial("effort", spec.effort);

  const platform = deps.platform ?? process.platform;
  if (platform === "darwin") {
    const launchString = buildLaunchString(spec, resolveClaudeCommand(settings.claudeBinary));
    await (deps.launchMac ?? launchMac)(launchString, settings.terminal);
    return;
  }
  if (platform === "win32") {
    // Windows groundwork — see spawn/windows.ts. NOT yet verified on a real Windows machine.
    const launchString = buildWinLaunchString(spec, resolveClaudeCommandWin(settings.claudeBinary));
    await (deps.launchWin ?? launchWin)(launchString);
    return;
  }
  throw new Error(`Launching is not implemented on this platform yet (platform: ${platform}).`);
}
