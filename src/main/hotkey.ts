export const DEFAULT_HOTKEY = "Alt+W"; // Option+W on macOS

/** Registration order: preferred, then the currently-active binding (so a failed change keeps it), then the default; blanks removed, de-duplicated. */
export function hotkeyCandidates(preferred: string, current = ""): string[] {
  const list = [preferred?.trim(), current?.trim(), DEFAULT_HOTKEY].filter((h): h is string => !!h);
  return [...new Set(list)];
}
