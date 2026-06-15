import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outdir = path.join(root, "dist", "browser-extension");
const appDir = path.join(root, "apps", "browser-extension");

await fs.rm(outdir, { recursive: true, force: true });
await fs.mkdir(outdir, { recursive: true });

await build({
  entryPoints: {
    background: path.join(appDir, "src", "background.ts"),
    popup: path.join(appDir, "src", "popup.ts"),
    options: path.join(appDir, "src", "options.ts"),
  },
  outdir,
  bundle: true,
  format: "iife",
  target: "chrome115",
  sourcemap: false,
});

for (const file of ["manifest.json", "popup.html", "options.html", "styles.css"]) {
  await fs.copyFile(path.join(appDir, "public", file), path.join(outdir, file));
}

console.log(`Browser extension built to ${outdir}`);
