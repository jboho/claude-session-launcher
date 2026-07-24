export const DEFAULT_HOTKEY = "Alt+W"; // Option+W on macOS

/** Registration order: the preferred hotkey (if any) first, then the default, de-duplicated. */
export function hotkeyCandidates(preferred: string): string[] {
  const list = [preferred?.trim(), DEFAULT_HOTKEY].filter((h): h is string => !!h);
  return [...new Set(list)];
}
