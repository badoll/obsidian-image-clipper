import os from "node:os";
import path from "node:path";

export const HOST_NAME = "com.obsidian_image_clipper.cookie_sync";
export const USER_DATA_DIR = path.join(os.homedir(), ".obsidian-image-clipper");
export const USER_CONFIG_PATH = path.join(USER_DATA_DIR, "config.json");
export const DEFAULT_AUTH_CONFIG_PATH = path.join(USER_DATA_DIR, "auth.json");
export const HOST_SETTINGS_PATH = path.join(USER_DATA_DIR, "native-host-settings.json");

export function chromeNativeHostManifestPath(browser: "chrome" | "edge"): string {
  const browserDir =
    browser === "chrome"
      ? path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome")
      : path.join(os.homedir(), "Library", "Application Support", "Microsoft Edge");

  return path.join(browserDir, "NativeMessagingHosts", `${HOST_NAME}.json`);
}
