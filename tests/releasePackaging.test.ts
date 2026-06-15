import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("release packaging", () => {
  it("copies all required runtime artifacts into one release directory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "oic-release-"));
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ version: "9.9.9" }));

    await writeFiles(root, "dist/browser-extension", ["manifest.json", "background.js", "popup.js", "options.js", "styles.css"]);
    await writeFiles(root, "dist/native-host", ["obsidian-image-clipper-cookie-host.js"]);
    await writeFiles(root, "dist/obsidian-plugin", ["manifest.json", "main.js", "styles.css"]);
    await writeFiles(root, "scripts", ["install-native-host-macos.mjs", "native-host-wrapper.mjs"]);

    const { packageRelease } = await import("../scripts/package-release.mjs");
    const { releaseDir, manifest } = await packageRelease(root);

    expect(manifest.artifacts.map((artifact: { name: string }) => artifact.name)).toEqual([
      "browser-extension",
      "native-host",
      "obsidian-image-clipper",
    ]);
    await expect(fs.access(path.join(releaseDir, "browser-extension", "manifest.json"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(releaseDir, "native-host", "obsidian-image-clipper-cookie-host.js"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(releaseDir, "obsidian-image-clipper", "main.js"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(releaseDir, "scripts", "install-native-host-macos.mjs"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(releaseDir, "scripts", "native-host-wrapper.mjs"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(releaseDir, "artifact-manifest.json"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(releaseDir, "INSTALL.md"))).resolves.toBeUndefined();
  });
});

async function writeFiles(root: string, dir: string, files: string[]): Promise<void> {
  const targetDir = path.join(root, dir);
  await fs.mkdir(targetDir, { recursive: true });
  await Promise.all(files.map((file) => fs.writeFile(path.join(targetDir, file), file)));
}
