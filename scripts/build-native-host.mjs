import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeNodeShebang } from "./native-host-shebang.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outdir = path.join(root, "dist", "native-host");
const outfile = path.join(outdir, "obsidian-image-clipper-cookie-host.js");

await fs.rm(outdir, { recursive: true, force: true });
await fs.mkdir(outdir, { recursive: true });

await build({
  entryPoints: [path.join(root, "apps", "native-host", "src", "index.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
});

const bundled = await fs.readFile(outfile, "utf8");
await fs.writeFile(outfile, normalizeNodeShebang(bundled));
await fs.chmod(outfile, 0o755);
console.log(`Native host built to ${outfile}`);
