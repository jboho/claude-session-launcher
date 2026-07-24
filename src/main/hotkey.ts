export const DEFAULT_HOTKEY = "Alt+W"; // Option+W on macOS
// Alt+<letter> triggers menu-bar mnemonics on Windows, so use a Ctrl+Alt combo there.
export const DEFAULT_HOTKEY_WIN = "Control+Alt+C";

/** The default global hotkey for the given platform (defaults to the current process's). */
export function defaultHotkey(platform: string = process.platform): string {
  return platform === "win32" ? DEFAULT_HOTKEY_WIN : DEFAULT_HOTKEY;
}

/** Registration order: preferred, then the currently-active binding (so a failed change keeps it), then the platform default; blanks removed, de-duplicated. */
export function hotkeyCandidates(preferred: string, current = "", platform: string = process.platform): string[] {
  const list = [preferred?.trim(), current?.trim(), defaultHotkey(platform)].filter((h): h is string => !!h);
  return [...new Set(list)];
}
