import { dialog, ipcMain } from "electron";
import { loadPresets, directoryExists } from "../core/presets-store.js";
import { loadSettings, saveSettings } from "../core/settings.js";
import { upsertPreset, removePreset } from "./preset-actions.js";
import { launchSpec } from "./spawn/index.js";
import type { LaunchSpec, Preset, Settings } from "../core/types.js";

export function registerIpc(): void {
  ipcMain.handle("presets:get", () => loadPresets());
  ipcMain.handle("presets:upsert", (_e, p: Preset) => upsertPreset(p));
  ipcMain.handle("presets:remove", (_e, id: string) => removePreset(id));
  ipcMain.handle("settings:get", () => loadSettings());
  ipcMain.handle("settings:save", async (_e, s: Settings) => {
    await saveSettings(s);
    return s;
  });
  ipcMain.handle("launch", async (_e, spec: LaunchSpec) => {
    try {
      const settings = await loadSettings();
      await launchSpec(spec, settings);
    } catch (err) {
      dialog.showErrorBox("Launch failed", err instanceof Error ? err.message : String(err));
      throw err;
    }
  });
  ipcMain.handle("validate-workdir", (_e, dir: string) => directoryExists(dir));
}
