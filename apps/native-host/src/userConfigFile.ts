import fs from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_USER_CONFIG,
  UserConfig,
  normalizeUserConfig,
} from "../../../packages/shared/src/index";
import { USER_CONFIG_PATH } from "./paths";

export type UserConfigFileResult = {
  path: string;
  exists: boolean;
  config: UserConfig;
  errors: string[];
};

export async function readUserConfigFile(filePath = USER_CONFIG_PATH): Promise<UserConfigFileResult> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const validation = normalizeUserConfig(parsed);

    if (!validation.ok) {
      return {
        path: filePath,
        exists: true,
        config: DEFAULT_USER_CONFIG,
        errors: validation.errors,
      };
    }

    return {
      path: filePath,
      exists: true,
      config: validation.value,
      errors: [],
    };
  } catch (error) {
    const missing = error && typeof error === "object" && "code" in error && error.code === "ENOENT";
    return {
      path: filePath,
      exists: false,
      config: DEFAULT_USER_CONFIG,
      errors: missing ? [] : [error instanceof Error ? error.message : String(error)],
    };
  }
}

export async function writeUserConfigFile(config: unknown, filePath = USER_CONFIG_PATH): Promise<UserConfigFileResult> {
  const validation = normalizeUserConfig(config);
  if (!validation.ok) {
    throw new Error(`Invalid user config: ${validation.errors.join("; ")}`);
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(validation.value, null, 2)}\n`, { mode: 0o600 });
  await fs.chmod(tmpPath, 0o600);
  await fs.rename(tmpPath, filePath);
  await fs.chmod(filePath, 0o600);

  return {
    path: filePath,
    exists: true,
    config: validation.value,
    errors: [],
  };
}
