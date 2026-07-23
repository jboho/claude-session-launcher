import { mkdir, cp, rename } from "node:fs/promises";

await mkdir("dist/renderer", { recursive: true });
await cp("src/renderer/index.html", "dist/renderer/index.html");
await cp("src/renderer/panel.css", "dist/renderer/panel.css");

// Electron loads ESM preload scripts only when they use the .mjs extension.
// tsc emits preload.js (ESM, since package.json is "type":"module"), so rename it.
await rename("dist/preload/preload.js", "dist/preload/preload.mjs");
