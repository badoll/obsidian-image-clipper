import { DEFAULT_AUTH_DOMAIN, DEFAULT_REFRESH_INTERVAL_MINUTES, ValidationResult, validateExactDomain } from "./authConfig";

export const USER_CONFIG_VERSION = 1 as const;
export const DEFAULT_USER_CONFIG_PATH = "~/.obsidian-image-clipper/config.json";
export const DEFAULT_USER_AUTH_CONFIG_PATH = "~/.obsidian-image-clipper/auth.json";
export const DEFAULT_AUTH_CONFIG_STALE_MINUTES = 120;

export type UserConfig = {
  version: typeof USER_CONFIG_VERSION;
  protectedDomains: string[];
  cookieSyncEnabled: boolean;
  refreshIntervalMinutes: number;
  authDownloadsEnabled: boolean;
  authConfigPath: string;
  authConfigStaleMinutes: number;
};

export const DEFAULT_USER_CONFIG: UserConfig = {
  version: USER_CONFIG_VERSION,
  protectedDomains: [],
  cookieSyncEnabled: true,
  refreshIntervalMinutes: DEFAULT_REFRESH_INTERVAL_MINUTES,
  authDownloadsEnabled: true,
  authConfigPath: DEFAULT_USER_AUTH_CONFIG_PATH,
  authConfigStaleMinutes: DEFAULT_AUTH_CONFIG_STALE_MINUTES,
};

export function normalizeUserConfig(input: unknown): ValidationResult<UserConfig> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["user config must be an object"] };
  }

  const value = input as Record<string, unknown>;
  const errors: string[] = [];

  if (value.version !== undefined && value.version !== USER_CONFIG_VERSION) {
    errors.push(`version must be ${USER_CONFIG_VERSION}`);
  }

  const domainsValidation = normalizeProtectedDomains(value, errors);

  const cookieSyncEnabled = value.cookieSyncEnabled ?? DEFAULT_USER_CONFIG.cookieSyncEnabled;
  if (typeof cookieSyncEnabled !== "boolean") {
    errors.push("cookieSyncEnabled must be a boolean");
  }

  const authDownloadsEnabled = value.authDownloadsEnabled ?? DEFAULT_USER_CONFIG.authDownloadsEnabled;
  if (typeof authDownloadsEnabled !== "boolean") {
    errors.push("authDownloadsEnabled must be a boolean");
  }

  const refreshInterval = normalizeInteger(
    value.refreshIntervalMinutes,
    DEFAULT_USER_CONFIG.refreshIntervalMinutes,
    5,
    1440,
    "refreshIntervalMinutes",
    errors,
  );

  const staleMinutes = normalizeInteger(
    value.authConfigStaleMinutes,
    DEFAULT_USER_CONFIG.authConfigStaleMinutes,
    5,
    10080,
    "authConfigStaleMinutes",
    errors,
  );

  const authConfigPath = value.authConfigPath ?? DEFAULT_USER_CONFIG.authConfigPath;
  if (typeof authConfigPath !== "string" || authConfigPath.trim() === "") {
    errors.push("authConfigPath must be a non-empty string");
  }

  if (errors.length > 0 || !domainsValidation.ok) {
    return { ok: false, errors };
  }

  const protectedDomains = domainsValidation.value;

  return {
    ok: true,
    value: {
      version: USER_CONFIG_VERSION,
      protectedDomains,
      cookieSyncEnabled: cookieSyncEnabled as boolean,
      refreshIntervalMinutes: refreshInterval,
      authDownloadsEnabled: authDownloadsEnabled as boolean,
      authConfigPath: (authConfigPath as string).trim(),
      authConfigStaleMinutes: staleMinutes,
    },
    errors: [],
  };
}

function normalizeProtectedDomains(
  value: Record<string, unknown>,
  errors: string[],
): ValidationResult<string[]> {
  if (value.protectedDomains === undefined) {
    return { ok: true, value: [], errors: [] };
  }

  if (!Array.isArray(value.protectedDomains)) {
    errors.push("protectedDomains must be an array");
    return { ok: false, errors };
  }

  const domains = normalizeDomainList(value.protectedDomains, "protectedDomains", errors);
  return { ok: true, value: domains, errors: [] };
}

function normalizeDomainList(rawDomains: unknown[], fieldName: string, errors: string[]): string[] {
  const domains: string[] = [];
  const seen = new Set<string>();

  rawDomains.forEach((rawDomain, index) => {
    const validation = validateExactDomain(rawDomain);
    if (!validation.ok) {
      errors.push(...validation.errors.map((error) => `${fieldName}[${index}] ${error}`));
      return;
    }

    if (seen.has(validation.value)) return;
    if (validation.value === DEFAULT_AUTH_DOMAIN) return;
    seen.add(validation.value);
    domains.push(validation.value);
  });

  return domains;
}

function normalizeInteger(
  input: unknown,
  fallback: number,
  min: number,
  max: number,
  fieldName: string,
  errors: string[],
): number {
  const value = input === undefined ? fallback : Number(input);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    errors.push(`${fieldName} must be an integer`);
    return fallback;
  }

  if (value < min || value > max) {
    errors.push(`${fieldName} must be between ${min} and ${max}`);
    return fallback;
  }

  return value;
}
