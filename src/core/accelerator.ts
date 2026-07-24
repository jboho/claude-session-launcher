export interface KeyEventLike {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  key: string;
}

const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift"]);
const NAMED: Record<string, string> = {
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
  Escape: "Escape", Enter: "Return", Tab: "Tab", " ": "Space", Backspace: "Backspace", Delete: "Delete",
};

function normalizeKey(k: string): string {
  if (NAMED[k]) return NAMED[k];
  if (/^[a-z]$/.test(k)) return k.toUpperCase();
  if (/^[A-Z0-9]$/.test(k)) return k;
  if (/^F\d{1,2}$/.test(k)) return k;
  if (k.length === 1) return k; // punctuation
  return "";
}

/** Build an Electron accelerator string from a keydown event. Returns "" if not a valid chord. */
export function eventToAccelerator(e: KeyEventLike): string {
  if (MODIFIER_KEYS.has(e.key)) return ""; // a modifier pressed alone — keep waiting
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Control");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Command");
  if (mods.length === 0) return ""; // require at least one modifier
  const key = normalizeKey(e.key);
  return key ? [...mods, key].join("+") : "";
}
