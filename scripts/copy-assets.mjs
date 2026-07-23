import { mkdir, cp } from "node:fs/promises";

await mkdir("dist/renderer", { recursive: true });
await cp("src/renderer/index.html", "dist/renderer/index.html");
await cp("src/renderer/panel.css", "dist/renderer/panel.css");
