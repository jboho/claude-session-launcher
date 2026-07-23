import { app, BrowserWindow, Menu, Tray, nativeImage, screen } from "electron";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { registerIpc } from "./ipc.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Identify as "Claude Launcher" (not the default unpackaged "app" label).
app.setName("Claude Launcher");

// Menu-bar icon: a lightning-bolt template PNG (black-on-transparent; macOS tints
// it for light/dark). An empty nativeImage renders a zero-width, invisible status
// item, so a real image is required for the tray to appear.
const TRAY_ICON_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAKElEQVR4nGNgoAX4T0garwIC0kTpx6PgPxokTZpEawg4Ey+gTJo8AAATByPdD0g2WwAAAABJRU5ErkJggg==";

let tray: Tray | null = null;
let panel: BrowserWindow | null = null;

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

app.whenReady().then(() => {
  // Dock icon kept visible on purpose: on machines where the menu-bar tray icon
  // is hidden (notch / menu-bar managers), the Dock icon is a reliable way to
  // reopen the panel.
  registerIpc();
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

  // Show once on launch so the panel is immediately visible.
  positionAndShow();
});

// Keep running when the panel window is hidden/closed.
app.on("window-all-closed", () => {
  /* no-op: this is a tray/dock app */
});

// Clicking the Dock icon reopens the panel.
app.on("activate", () => positionAndShow());
