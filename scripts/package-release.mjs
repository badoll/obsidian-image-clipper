import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const RELEASE_ARTIFACTS = [
  {
    name: "browser-extension",
    source: "dist/browser-extension",
    requiredFiles: ["manifest.json", "background.js", "popup.js", "options.js", "styles.css"],
  },
  {
    name: "native-host",
    source: "dist/native-host",
    requiredFiles: ["obsidian-image-clipper-cookie-host.js"],
  },
  {
    name: "obsidian-image-clipper",
    source: "dist/obsidian-plugin",
    requiredFiles: ["manifest.json", "main.js", "styles.css"],
  },
];

export const RELEASE_SUPPORT_FILES = [
  {
    source: "scripts/install-native-host-macos.mjs",
    target: "scripts/install-native-host-macos.mjs",
  },
  {
    source: "scripts/native-host-wrapper.mjs",
    target: "scripts/native-host-wrapper.mjs",
  },
];

export async function packageRelease(root = defaultRoot) {
  const rootPackage = await readJson(path.join(root, "package.json"));
  const version = rootPackage.version ?? "0.0.0";
  const releaseDir = path.join(root, "dist", "release", `obsidian-image-clipper-${version}`);

  await fs.rm(releaseDir, { recursive: true, force: true });
  await fs.mkdir(releaseDir, { recursive: true });

  for (const artifact of RELEASE_ARTIFACTS) {
    const sourceDir = path.join(root, artifact.source);
    await assertRequiredFiles(sourceDir, artifact.requiredFiles);
    await fs.cp(sourceDir, path.join(releaseDir, artifact.name), { recursive: true });
  }

  for (const file of RELEASE_SUPPORT_FILES) {
    await copyRequiredFile(path.join(root, file.source), path.join(releaseDir, file.target));
  }

  const manifest = {
    name: "obsidian-image-clipper",
    version,
    createdAt: new Date().toISOString(),
    artifacts: RELEASE_ARTIFACTS.map((artifact) => ({
      name: artifact.name,
      path: artifact.name,
      requiredFiles: artifact.requiredFiles,
    })),
    supportFiles: RELEASE_SUPPORT_FILES.map((file) => file.target),
  };

  await fs.writeFile(path.join(releaseDir, "artifact-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(path.join(releaseDir, "INSTALL.md"), installMarkdown(version));

  console.log(`Release package created at ${releaseDir}`);
  return { releaseDir, manifest };
}

export async function assertRequiredFiles(sourceDir, requiredFiles) {
  const missing = [];
  for (const file of requiredFiles) {
    try {
      await fs.access(path.join(sourceDir, file));
    } catch {
      missing.push(file);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing release artifact files in ${sourceDir}: ${missing.join(", ")}`);
  }
}

async function copyRequiredFile(sourcePath, targetPath) {
  try {
    await fs.access(sourcePath);
  } catch {
    throw new Error(`Missing release support file: ${sourcePath}`);
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function installMarkdown(version) {
  return `# Obsidian Image Clipper ${version}

This release directory contains:

- \`browser-extension/\`: load this as the unpacked Chrome or Edge extension.
- \`native-host/\`: Native Messaging host build output used by the installer.
- \`obsidian-image-clipper/\`: copy this whole folder into your Obsidian plugins directory.
- \`scripts/install-native-host-macos.mjs\`: macOS Native Messaging installer.

Install the native host after loading the browser extension:

\`\`\`bash
node scripts/install-native-host-macos.mjs --browser=chrome --extension-id=<loaded-extension-id>
\`\`\`

For Edge, use \`--browser=edge\`. See the repository README for the full setup
flow and troubleshooting steps.
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await packageRelease();
}
