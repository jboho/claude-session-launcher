import { app, BrowserWindow, Tray, nativeImage } from "electron";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { registerIpc } from "./ipc.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

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
      preload: path.join(dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(path.join(dirname, "../renderer/index.html"));
  win.on("blur", () => win.hide());
  return win;
}

function togglePanel(): void {
  if (!panel) return;
  if (panel.isVisible()) {
    panel.hide();
    return;
  }
  // Position the panel just under the tray icon.
  const trayBounds = tray?.getBounds();
  const winBounds = panel.getBounds();
  if (trayBounds) {
    const x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
    const y = Math.round(trayBounds.y + trayBounds.height + 4);
    panel.setPosition(x, Math.max(y, 0), false);
  }
  panel.show();
  panel.focus();
}

app.whenReady().then(() => {
  if (process.platform === "darwin") app.dock?.hide();
  registerIpc();
  panel = createPanel();
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle("⚡");
  tray.setToolTip("Claude Launcher");
  tray.on("click", () => togglePanel());
});

// Tray app: keep running when the panel window is hidden/closed.
app.on("window-all-closed", () => {
  /* no-op: this is a menu-bar app */
});
