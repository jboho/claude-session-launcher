import { mkdir, cp } from "node:fs/promises";

// tsc emits the renderer's JS (panel.js, bridge.js) into dist/renderer; its static
// index.html and panel.css are not TypeScript, so copy them alongside. Tauri serves the
// whole dist/ tree (frontendDist in src-tauri/tauri.conf.json). The tray icon is embedded
// in the Rust binary (src-tauri/icons/, via include_bytes!), so nothing else is copied here.
await mkdir("dist/renderer", { recursive: true });
await cp("src/renderer/index.html", "dist/renderer/index.html");
await cp("src/renderer/panel.css", "dist/renderer/panel.css");
