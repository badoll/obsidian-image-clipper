import fs from "node:fs/promises";
import path from "node:path";
import {
  AuthConfig,
  AuthConfigMetadata,
  maskSecrets,
  toAuthConfigMetadata,
  validateAuthConfig,
} from "../../../packages/shared/src/index";
import { DEFAULT_AUTH_CONFIG_PATH } from "./paths";

export async function writeAuthConfigFile(config: unknown, filePath = DEFAULT_AUTH_CONFIG_PATH): Promise<AuthConfigMetadata> {
  const validation = validateAuthConfig(config);
  if (!validation.ok) {
    throw new Error(`Invalid auth config: ${validation.errors.join("; ")}`);
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const serialized = `${JSON.stringify(validation.value, null, 2)}\n`;

  await fs.writeFile(tmpPath, serialized, { mode: 0o600 });
  await fs.chmod(tmpPath, 0o600);
  await fs.rename(tmpPath, filePath);
  await fs.chmod(filePath, 0o600);

  return toAuthConfigMetadata(validation.value);
}

export async function readAuthConfigMetadata(filePath = DEFAULT_AUTH_CONFIG_PATH): Promise<AuthConfigMetadata & { path: string; exists: boolean }> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as AuthConfig;
    const validation = validateAuthConfig(parsed);

    if (!validation.ok) {
      throw new Error(validation.errors.join("; "));
    }

    return {
      ...toAuthConfigMetadata(validation.value),
      path: filePath,
      exists: true,
    };
  } catch {
    return {
      path: filePath,
      exists: false,
      rules: [],
    };
  }
}

export function safeForLog(value: unknown): unknown {
  return maskSecrets(value);
}
