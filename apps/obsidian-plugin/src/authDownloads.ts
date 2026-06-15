import fs from "fs";
import path from "path";
import os from "os";
import {
  AuthConfig,
  AuthConfigMetadata,
  DEFAULT_USER_CONFIG,
  DEFAULT_USER_CONFIG_PATH,
  UserConfig,
  getAuthHeadersForUrl,
  isAuthConfigStale,
  maskSecrets,
  normalizeUserConfig,
  toAuthConfigMetadata,
  validateAuthConfig,
} from "@obsidian-image-clipper/shared";
import { DEFAULT_AUTH_CONFIG_PATH, ISettings } from "./config";

const fs2 = fs.promises;

type AuthConfigCacheEntry = {
  path: string;
  mtimeMs: number;
  config: AuthConfig;
  metadata: AuthConfigMetadata;
};

let authConfigCache: AuthConfigCacheEntry | null = null;

export type LoadedAuthConfig = {
  path: string;
  exists: boolean;
  config: AuthConfig | null;
  metadata: AuthConfigMetadata;
  stale: boolean;
  errors: string[];
};

export type LoadedUserConfig = {
  path: string;
  exists: boolean;
  config: UserConfig;
  errors: string[];
};

export type AuthDiagnostics = {
  url: string;
  configPath: string;
  configExists: boolean;
  configStale: boolean;
  authUsed: boolean;
  status?: number;
  contentType?: string;
  ok: boolean;
  loginPageSuspected: boolean;
  error?: string;
  rules: AuthConfigMetadata["rules"];
};

export function resolveAuthConfigPath(configPath: string): string {
  if (!configPath || configPath.trim() === "") {
    return "";
  }

  if (configPath === "~") {
    return os.homedir();
  }

  if (configPath.startsWith("~/")) {
    return path.join(os.homedir(), configPath.slice(2));
  }

  return path.resolve(configPath);
}

export async function loadUserConfig(configPath = DEFAULT_USER_CONFIG_PATH): Promise<LoadedUserConfig> {
  const filePath = resolveAuthConfigPath(configPath);

  try {
    const raw = await fs2.readFile(filePath, "utf8");
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

export async function loadAuthConfig(settings: ISettings): Promise<LoadedAuthConfig> {
  const userConfig = await loadUserConfig();
  const authConfigPath =
    !settings.authConfigPath || settings.authConfigPath === DEFAULT_AUTH_CONFIG_PATH
      ? userConfig.config.authConfigPath
      : settings.authConfigPath;
  const authDownloadsEnabled = settings.authDownloadsEnabled && userConfig.config.authDownloadsEnabled;
  const staleMinutes = userConfig.exists && userConfig.errors.length === 0
    ? userConfig.config.authConfigStaleMinutes
    : settings.authConfigStaleMinutes;
  const filePath = resolveAuthConfigPath(authConfigPath);
  const emptyMetadata: AuthConfigMetadata = { rules: [] };

  if (!authDownloadsEnabled || !filePath) {
    return {
      path: filePath,
      exists: false,
      config: null,
      metadata: emptyMetadata,
      stale: false,
      errors: [],
    };
  }

  try {
    const stat = await fs2.stat(filePath);
    if (authConfigCache && authConfigCache.path === filePath && authConfigCache.mtimeMs === stat.mtimeMs) {
      return {
        path: filePath,
        exists: true,
        config: authConfigCache.config,
        metadata: authConfigCache.metadata,
        stale: isAuthConfigStale(authConfigCache.config, staleMinutes),
        errors: [],
      };
    }

    const raw = await fs2.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const validation = validateAuthConfig(parsed);

    if (!validation.ok) {
      clearAuthConfigCache(filePath);
      return {
        path: filePath,
        exists: true,
        config: null,
        metadata: emptyMetadata,
        stale: true,
        errors: validation.errors,
      };
    }

    const metadata = toAuthConfigMetadata(validation.value);
    authConfigCache = {
      path: filePath,
      mtimeMs: stat.mtimeMs,
      config: validation.value,
      metadata,
    };

    return {
      path: filePath,
      exists: true,
      config: validation.value,
      metadata,
      stale: isAuthConfigStale(validation.value, staleMinutes),
      errors: [],
    };
  } catch (error) {
    clearAuthConfigCache(filePath);
    return {
      path: filePath,
      exists: false,
      config: null,
      metadata: emptyMetadata,
      stale: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export function clearAuthConfigCache(filePath?: string): void {
  if (!filePath || authConfigCache?.path === filePath) {
    authConfigCache = null;
  }
}

export async function getAuthenticatedHeaders(link: string, settings: ISettings): Promise<Record<string, string>> {
  const loaded = await loadAuthConfig(settings);
  if (!loaded.config) return {};

  const headers = getAuthHeadersForUrl(loaded.config, link);
  return headers ? { ...headers } : {};
}

export async function diagnoseAuthenticatedUrl(url: string, settings: ISettings): Promise<AuthDiagnostics> {
  const loaded = await loadAuthConfig(settings);
  const authHeaders = loaded.config ? getAuthHeadersForUrl(loaded.config, url) : null;
  const { downloadImageDetailed } = await import("./utils");
  const result = await downloadImageDetailed(url, authHeaders ?? {});

  return {
    url,
    configPath: loaded.path,
    configExists: loaded.exists,
    configStale: loaded.stale,
    authUsed: Boolean(authHeaders?.Cookie),
    status: result.status,
    contentType: result.contentType,
    ok: result.ok,
    loginPageSuspected: result.loginPageSuspected,
    error: result.error,
    rules: loaded.metadata.rules,
  };
}

export function formatDiagnostics(diagnostics: AuthDiagnostics): string {
  const lines = [
    diagnostics.ok ? "Diagnostics: download looks valid." : "Diagnostics: download failed or returned a non-download response.",
    `Auth file: ${diagnostics.configExists ? "found" : "missing"} (${diagnostics.configPath})`,
    `Auth used: ${diagnostics.authUsed ? "yes" : "no"}`,
    `Auth stale: ${diagnostics.configStale ? "yes" : "no"}`,
    `Status: ${diagnostics.status ?? "unknown"}`,
    `Content-Type: ${diagnostics.contentType ?? "unknown"}`,
    `Login page suspected: ${diagnostics.loginPageSuspected ? "yes" : "no"}`,
  ];

  if (diagnostics.error) {
    lines.push(`Error: ${diagnostics.error}`);
  }

  if (diagnostics.rules.length > 0) {
    lines.push(`Rules: ${diagnostics.rules.map((rule) => rule.domain).join(", ")}`);
  }

  return lines.join("\n");
}

export function safeAuthLog(value: unknown): unknown {
  return maskSecrets(value);
}
