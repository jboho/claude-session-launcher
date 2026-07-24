import { describe, expect, test } from "vitest";
import { eventToAccelerator, type KeyEventLike } from "./accelerator.js";

const ev = (over: Partial<KeyEventLike>): KeyEventLike => ({
  altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, key: "", ...over,
});

describe("eventToAccelerator", () => {
  test("Alt+W", () => {
    expect(eventToAccelerator(ev({ altKey: true, key: "w" }))).toBe("Alt+W");
  });
  test("orders modifiers Control, Alt, Shift, Command", () => {
    expect(eventToAccelerator(ev({ ctrlKey: true, altKey: true, shiftKey: true, metaKey: true, key: "k" })))
      .toBe("Control+Alt+Shift+Command+K");
  });
  test("named keys map to Electron names", () => {
    expect(eventToAccelerator(ev({ metaKey: true, key: "ArrowUp" }))).toBe("Command+Up");
    expect(eventToAccelerator(ev({ ctrlKey: true, key: " " }))).toBe("Control+Space");
    expect(eventToAccelerator(ev({ altKey: true, key: "F5" }))).toBe("Alt+F5");
  });
  test("returns '' for a modifier alone or no modifier", () => {
    expect(eventToAccelerator(ev({ key: "Alt", altKey: true }))).toBe("");
    expect(eventToAccelerator(ev({ key: "a" }))).toBe("");
  });
});
