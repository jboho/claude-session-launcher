import { buildLaunchString } from "../../core/launch-string.js";
import type { LaunchSpec, Settings } from "../../core/types.js";
import { launchMac } from "./macos.js";

export type MacLauncher = (launchString: string, terminalApp?: string) => Promise<void>;

/**
 * model/mode/effort are passed UNQUOTED into the shell command, so restrict them
 * to a safe charset — defense-in-depth against a hand-edited presets.json that
 * smuggles shell metacharacters through those dials. wd/cmd are single-quoted by
 * buildLaunchString and are intentionally NOT restricted (they legitimately hold
 * spaces, slashes, etc.).
 */
const SAFE_DIAL = /^[A-Za-z0-9._-]*$/;

function assertSafeDial(name: string, value: string): void {
  if (!SAFE_DIAL.test(value)) {
    throw new Error(`Unsafe ${name} value: ${JSON.stringify(value)} — only letters, digits, '.', '-', '_' are allowed.`);
  }
}

export async function launchSpec(
  spec: LaunchSpec,
  settings: Settings,
  deps: { platform?: string; launchMac?: MacLauncher } = {},
): Promise<void> {
  assertSafeDial("model", spec.model);
  assertSafeDial("mode", spec.mode);
  assertSafeDial("effort", spec.effort);

  const platform = deps.platform ?? process.platform;
  const launchString = buildLaunchString(spec);
  if (platform === "darwin") {
    await (deps.launchMac ?? launchMac)(launchString, settings.terminal);
    return;
  }
  throw new Error(`Launching is only implemented on macOS in v1 (platform: ${platform}).`);
}
