import { contextBridge, ipcRenderer } from "electron";
import type { LaunchSpec, Preset, Settings } from "../core/types.js";

contextBridge.exposeInMainWorld("launcher", {
  getPresets: (): Promise<Preset[]> => ipcRenderer.invoke("presets:get"),
  upsertPreset: (p: Preset): Promise<Preset[]> => ipcRenderer.invoke("presets:upsert", p),
  removePreset: (id: string): Promise<Preset[]> => ipcRenderer.invoke("presets:remove", id),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke("settings:get"),
  saveSettings: (s: Settings): Promise<Settings> => ipcRenderer.invoke("settings:save", s),
  launch: (spec: LaunchSpec): Promise<void> => ipcRenderer.invoke("launch", spec),
  validateWorkdir: (dir: string): Promise<boolean> => ipcRenderer.invoke("validate-workdir", dir),
  detectClaude: (): Promise<{ found: boolean; path?: string }> => ipcRenderer.invoke("claude:detect"),
  detectTerminals: (): Promise<string[]> => ipcRenderer.invoke("terminals:detect"),
  setHotkey: (accel: string): Promise<string> => ipcRenderer.invoke("hotkey:set", accel),
});
