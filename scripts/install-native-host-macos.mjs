import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderNativeHostWrapper } from "./native-host-wrapper.mjs";

const HOST_NAME = "com.obsidian_image_clipper.cookie_sync";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const builtHostPathCandidates = [
  path.join(root, "native-host", "obsidian-image-clipper-cookie-host.js"),
  path.join(root, "dist", "native-host", "obsidian-image-clipper-cookie-host.js"),
];
const supportDir = path.join(os.homedir(), ".obsidian-image-clipper");
const installedHostDir = path.join(supportDir, "native-host");
const installedHostScriptPath = path.join(installedHostDir, "obsidian-image-clipper-cookie-host.js");
const installedHostPath = path.join(installedHostDir, "obsidian-image-clipper-cookie-host");
const userConfigPath = path.join(supportDir, "config.json");
const settingsPath = path.join(supportDir, "native-host-settings.json");

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--") && arg.includes("="))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split("=");
      return [key, rest.join("=")];
    }),
);

const browser = args.browser;
const extensionId = args["extension-id"];

if (browser !== "chrome" && browser !== "edge") {
  throw new Error("Usage: node scripts/install-native-host-macos.mjs --browser=chrome|edge --extension-id=<id>");
}

if (!extensionId) {
  throw new Error("Missing --extension-id=<id>. Load the unpacked extension first and copy its ID.");
}

if (!/^[a-p]{32}$/.test(extensionId)) {
  throw new Error("Invalid extension ID. Chrome and Edge extension IDs are 32 lowercase letters from a to p.");
}

const builtHostPath = await firstExistingPath(builtHostPathCandidates);
if (!builtHostPath) {
  throw new Error(
    `Native host build output is missing. Checked: ${builtHostPathCandidates.join(", ")}. Run npm run build:native-host first or use a release directory.`,
  );
}

await fs.mkdir(supportDir, { recursive: true });
await fs.mkdir(installedHostDir, { recursive: true });
await fs.copyFile(builtHostPath, installedHostScriptPath);
await fs.chmod(installedHostScriptPath, 0o755);
await fs.writeFile(
  installedHostPath,
  renderNativeHostWrapper({
    nodePath: process.execPath,
    scriptPath: installedHostScriptPath,
  }),
);
await fs.chmod(installedHostPath, 0o755);
await ensureUserConfig(userConfigPath);

const allowedOrigin = `chrome-extension://${extensionId}/`;
const browserDir =
  browser === "chrome"
    ? path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome")
    : path.join(os.homedir(), "Library", "Application Support", "Microsoft Edge");

const manifestDir = path.join(browserDir, "NativeMessagingHosts");
const manifestPath = path.join(manifestDir, `${HOST_NAME}.json`);
const existingSettings = await readJson(settingsPath, { allowedOrigins: [] });
const existingManifest = await readJson(manifestPath, { allowed_origins: [] });
const allowedOrigins = mergeAllowedOrigins(existingSettings.allowedOrigins, existingManifest.allowed_origins, [allowedOrigin]);

await fs.writeFile(
  settingsPath,
  `${JSON.stringify(
    {
      allowedOrigins,
      hostPath: installedHostPath,
      hostScriptPath: installedHostScriptPath,
      nodePath: process.execPath,
      lastInstalledBrowser: browser,
      lastInstalledAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
  { mode: 0o600 },
);
await fs.chmod(settingsPath, 0o600);

const manifest = {
  name: HOST_NAME,
  description: "Obsidian Image Clipper Cookie Sync Host",
  path: installedHostPath,
  type: "stdio",
  allowed_origins: allowedOrigins,
};

await fs.mkdir(manifestDir, { recursive: true });
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Installed ${HOST_NAME}`);
console.log(`Browser: ${browser}`);
console.log(`Extension origin: ${allowedOrigin}`);
console.log(`User config: ${userConfigPath}`);
console.log(`Native host: ${installedHostPath}`);
console.log(`Native host script: ${installedHostScriptPath}`);
console.log(`Node executable: ${process.execPath}`);
console.log(`Browser manifest: ${manifestPath}`);

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function mergeAllowedOrigins(...originLists) {
  const origins = [];
  const seen = new Set();

  for (const originList of originLists) {
    if (!Array.isArray(originList)) continue;

    for (const origin of originList) {
      if (typeof origin !== "string" || !origin.startsWith("chrome-extension://")) continue;
      if (seen.has(origin)) continue;
      seen.add(origin);
      origins.push(origin);
    }
  }

  return origins;
}

async function firstExistingPath(filePaths) {
  for (const filePath of filePaths) {
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      // Try the next release/source layout candidate.
    }
  }
  return undefined;
}

async function ensureUserConfig(filePath) {
  try {
    await fs.access(filePath);
    return;
  } catch {
    const config = {
      version: 1,
      protectedDomains: [],
      cookieSyncEnabled: true,
      refreshIntervalMinutes: 30,
      authDownloadsEnabled: true,
      authConfigPath: "~/.obsidian-image-clipper/auth.json",
      authConfigStaleMinutes: 120,
    };
    await fs.writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    await fs.chmod(filePath, 0o600);
  }
}
