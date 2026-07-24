import { app, BrowserWindow, Menu, Tray, nativeImage, screen, globalShortcut } from "electron";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { registerIpc } from "./ipc.js";
import { ensureSeedPresets } from "./seed.js";
import { loadSettings } from "../core/settings.js";
import { hotkeyCandidates } from "./hotkey.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Identify as "Claude Launcher" (not the default unpackaged "app" label).
app.setName("Claude Launcher");

// Menu-bar icon: a Claude-style sunburst template PNG (black-on-transparent; macOS
// tints it for light/dark). An empty nativeImage renders a zero-width, invisible
// status item, so a real image is required for the tray to appear.
const TRAY_ICON_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAQAAAD8x0bcAAAAMUlEQVR4nGNgoAX4j4dHmiJkCSxK/uPQhyH+HwdJmnXUBwStI+hwooOAKOuoG3eUAABrcR/h1B98RgAAAABJRU5ErkJggg==";

let tray: Tray | null = null;
let panel: BrowserWindow | null = null;
let activeHotkey = "";

/** (Re)register the global hotkey. Returns the accelerator that actually ended up active ("" if none). */
function setHotkey(preferred: string): string {
  const prev = activeHotkey;
  globalShortcut.unregisterAll();
  for (const hk of hotkeyCandidates(preferred, prev)) {
    try {
      if (globalShortcut.register(hk, () => togglePanel())) {
        activeHotkey = hk;
        return hk;
      }
    } catch {
      // malformed accelerator string — treat as a failed registration, try the next candidate
    }
  }
  activeHotkey = "";
  return "";
}

function createPanel(): BrowserWindow {
  const win = new BrowserWindow({
    width: 420,
    height: 560,
    show: false,
    frame: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(dirname, "../preload/preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(path.join(dirname, "../renderer/index.html"));
  win.on("blur", () => win.hide());
  return win;
}

function positionAndShow(): void {
  if (!panel) return;
  const { workArea } = screen.getPrimaryDisplay();
  const winBounds = panel.getBounds();
  const trayBounds = tray?.getBounds();
  let x: number;
  let y: number;
  // Use the tray icon's position only when it's actually placed (a hidden/notch
  // status item reports height 0, which would push the panel off-screen).
  if (trayBounds && trayBounds.height > 0) {
    x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
    y = Math.round(trayBounds.y + trayBounds.height + 4);
  } else {
    // Fallback: top-center of the primary display.
    x = Math.round(workArea.x + (workArea.width - winBounds.width) / 2);
    y = Math.round(workArea.y + 60);
  }
  // Clamp fully into the visible work area.
  x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - winBounds.width));
  y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - winBounds.height));
  panel.setPosition(x, y, false);
  panel.show();
  panel.focus();
}

function togglePanel(): void {
  if (!panel) return;
  if (panel.isVisible()) {
    panel.hide();
    return;
  }
  positionAndShow();
}

app.whenReady().then(async () => {
  await ensureSeedPresets();
  // Dock icon kept visible on purpose: on machines where the menu-bar tray icon
  // is hidden (notch / menu-bar managers), the Dock icon is a reliable way to
  // reopen the panel.
  registerIpc({ setHotkey });
  panel = createPanel();

  const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL);
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("Claude Launcher");

  // Left-click toggles the panel; right-click opens a menu (Open / Quit).
  const menu = Menu.buildFromTemplate([
    { label: "Open Claude Launcher", click: () => positionAndShow() },
    { type: "separator" },
    { role: "quit" },
  ]);
  tray.on("click", () => togglePanel());
  tray.on("right-click", () => tray?.popUpContextMenu(menu));

  // Global hotkey from settings, falling back to the default then to none.
  const startupSettings = await loadSettings();
  setHotkey(startupSettings.hotkey);
  console.log(`[launcher] global hotkey: ${activeHotkey || "NONE (all candidates were taken)"}`);

  // Show once on launch so the panel is immediately visible.
  positionAndShow();
});

// Keep running when the panel window is hidden/closed.
app.on("window-all-closed", () => {
  /* no-op: this is a tray/dock app */
});

// Clicking the Dock icon reopens the panel.
app.on("activate", () => positionAndShow());

// Release the global hotkey on quit.
app.on("will-quit", () => globalShortcut.unregisterAll());
