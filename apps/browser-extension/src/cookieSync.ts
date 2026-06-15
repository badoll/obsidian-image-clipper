import {
  AUTH_CONFIG_VERSION,
  AuthConfig,
  DEFAULT_AUTH_DOMAIN,
  DEFAULT_USER_CONFIG,
  UserConfig,
  buildCookieHeader,
  cookieDomainMatches,
  earliestCookieExpiration,
  normalizeUserConfig,
  validateExactDomain,
} from "../../../packages/shared/src/index";
import { DEFAULT_SETTINGS, DomainSyncState, ExtensionSettings, HOST_NAME, SyncState } from "./constants";
import { domainToCookieUrl, getDomainPermissionStatus, parentCookieDomain } from "./permissions";

type ChromeCookie = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  hostOnly?: boolean;
  storeId?: string;
  expirationDate?: number;
};

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(["settings"]);
  return normalizeSettings(stored.settings ?? DEFAULT_SETTINGS);
}

export async function saveSettings(settings: ExtensionSettings): Promise<ExtensionSettings> {
  const normalized = normalizeSettings(settings);
  const domains = validateSettingsDomains(normalized.domains);

  const nextSettings = {
    ...normalized,
    domains,
  };

  await chrome.storage.local.set({ settings: nextSettings });
  return nextSettings;
}

export async function readUserConfig(): Promise<{ path: string; exists: boolean; config: UserConfig; errors: string[] }> {
  const response = await sendNativeHostMessage({ type: "readUserConfig" });
  if (!response?.ok || !response.userConfig) {
    throw new Error(response?.error ?? "Native host user config read failed");
  }
  return response.userConfig;
}

export async function loadSettingsFromUserConfig(): Promise<{
  settings: ExtensionSettings;
  userConfig: { path: string; exists: boolean; config: UserConfig; errors: string[] };
}> {
  const userConfig = await readUserConfig();
  if (userConfig.errors.length > 0) {
    throw new Error(`Invalid user config: ${userConfig.errors.join("; ")}`);
  }
  const settings = await saveSettings(settingsFromUserConfig(userConfig.config));
  return { settings, userConfig };
}

export async function writeUserConfigFromSettings(
  settings: ExtensionSettings,
): Promise<{ path: string; exists: boolean; config: UserConfig; errors: string[] }> {
  let base = DEFAULT_USER_CONFIG;
  try {
    const current = await readUserConfig();
    if (current.errors.length === 0) {
      base = current.config;
    }
  } catch {
    // The browser settings can still be saved before the native host is installed.
  }

  const nextConfig = userConfigFromSettings(settings, base);
  const response = await sendNativeHostMessage({
    type: "writeUserConfig",
    config: nextConfig,
  });

  if (!response?.ok || !response.userConfig) {
    throw new Error(response?.error ?? "Native host user config write failed");
  }

  assertPersistedUserConfigMatchesSettings(response.userConfig, nextConfig);
  return response.userConfig;
}

export async function getSyncState(): Promise<SyncState> {
  const stored = await chrome.storage.local.get(["syncState"]);
  return stored.syncState ?? {};
}

export async function setSyncState(syncState: SyncState): Promise<void> {
  await chrome.storage.local.set({ syncState });
}

export async function configureAlarm(): Promise<void> {
  const settings = await getSettings();
  await chrome.alarms.clear("cookie-refresh");

  if (!settings.enabled) return;

  chrome.alarms.create("cookie-refresh", {
    periodInMinutes: settings.refreshIntervalMinutes,
  });
}

export async function syncCookiesNow(): Promise<SyncState> {
  const settings = await getSettings();
  let domains: string[];

  if (!settings.enabled) {
    const state = {
      lastError: "Cookie sync is disabled",
      permissionMissing: false,
      domains: settings.domains.map((domain) => ({ domain, error: "Cookie sync is disabled" })),
    };
    await setSyncState(state);
    return state;
  }

  try {
    domains = validateSettingsDomains(settings.domains);
  } catch (error) {
    const state = { lastError: error instanceof Error ? error.message : String(error) };
    await setSyncState(state);
    return state;
  }

  try {
    const browser = typeof navigator !== "undefined" && navigator.userAgent.includes("Edg/") ? "edge" : "chrome";
    const updatedAt = new Date().toISOString();
    const statuses: DomainSyncState[] = [];
    const rules: AuthConfig["rules"] = [];

    if (domains.length === 0) {
      const state = {
        lastSyncAt: updatedAt,
        lastCookieCount: 0,
        lastError: undefined,
        permissionMissing: false,
        domains: [],
      };
      await setSyncState(state);
      return state;
    }

    for (const domain of domains) {
      try {
        const cookieUrl = domainToCookieUrl(domain);
        if (!cookieUrl.ok) {
          throw new Error(cookieUrl.errors.join("; "));
        }

        const permission = await getDomainPermissionStatus(domain);
        if (!permission.hasPermission) {
          const origin = permission.origin ?? `https://${domain}/*`;
          const reason = permission.errors.length > 0 ? ` ${permission.errors.join("; ")}` : "";
          statuses.push({
            domain,
            error: `Browser host permission is missing for ${origin}.${reason}`,
            permissionMissing: true,
            permissionOrigin: origin,
          });
          continue;
        }

        const url = cookieUrl.value;
        const cookies = await collectCookiesForDomain(domain, url);
        const cookieHeader = buildCookieHeader(cookies);

        if (!cookieHeader) {
          statuses.push({
            domain,
            error: `No cookies found for ${domain}. Open the site and sign in first.`,
            permissionMissing: false,
            permissionOrigin: permission.origin,
          });
          continue;
        }

        rules.push({
          domain,
          headers: {
            Cookie: cookieHeader,
            Referer: url,
          },
          cookies,
          expiresAt: earliestCookieExpiration(cookies),
          source: {
            browser,
            extensionId: chrome.runtime.id,
          },
        });
        statuses.push({
          domain,
          lastSyncAt: updatedAt,
          cookieCount: cookies.length,
          permissionMissing: false,
          permissionOrigin: permission.origin,
        });
      } catch (error) {
        statuses.push({
          domain,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (rules.length === 0) {
      const state = {
        ...(await getSyncState()),
        lastError: summarizeDomainErrors(statuses) ?? "No domains synced",
        lastCookieCount: 0,
        permissionMissing: statuses.some((status) => status.permissionMissing),
        permissionOrigin: statuses.find((status) => status.permissionMissing)?.permissionOrigin,
        domains: statuses,
      };
      await setSyncState(state);
      return state;
    }

    const config: AuthConfig = {
      version: AUTH_CONFIG_VERSION,
      updatedAt,
      rules,
    };

    const nativeResponse = await sendNativeHostMessage({
      type: "writeAuthConfig",
      config,
    });

    if (!nativeResponse?.ok) {
      throw new Error(nativeResponse?.error ?? "Native host did not accept the auth config");
    }

    const state = {
      lastSyncAt: config.updatedAt,
      lastCookieCount: statuses.reduce((total, status) => total + (status.cookieCount ?? 0), 0),
      nativeMetadata: nativeResponse.metadata,
      lastError: summarizeDomainErrors(statuses),
      permissionMissing: statuses.some((status) => status.permissionMissing),
      permissionOrigin: statuses.find((status) => status.permissionMissing)?.permissionOrigin,
      domains: statuses,
    };

    await setSyncState(state);
    return state;
  } catch (error) {
    const state = {
      ...(await getSyncState()),
      lastError: error instanceof Error ? error.message : String(error),
    };
    await setSyncState(state);
    return state;
  }
}

export async function readNativeMetadata(): Promise<unknown> {
  const response = await sendNativeHostMessage({ type: "readMetadata" });
  if (!response?.ok) throw new Error(response?.error ?? "Native host metadata read failed");
  return response.metadata;
}

async function sendNativeHostMessage(message: unknown): Promise<any> {
  try {
    return await chrome.runtime.sendNativeMessage(HOST_NAME, message);
  } catch (error) {
    throw new Error(describeNativeMessagingError(error));
  }
}

export function describeNativeMessagingError(error: unknown, extensionId = chrome.runtime.id): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/forbidden/i.test(message)) {
    return [
      `Native host access is forbidden for this extension ID (${extensionId}).`,
      "Re-run the macOS native host installer with the current extension ID, then fully quit and reopen the browser.",
    ].join(" ");
  }

  if (/not found|no such native application|specified native messaging host/i.test(message)) {
    return [
      "Native host is not installed for this browser profile.",
      `Run the macOS native host installer with this extension ID (${extensionId}), then fully quit and reopen the browser.`,
    ].join(" ");
  }

  return message;
}

export async function collectCookiesForDomain(domain: string, rootUrl: string): Promise<ChromeCookie[]> {
  const parentDomain = parentCookieDomain(domain);
  const domains = Array.from(new Set([domain, ...(parentDomain ? [parentDomain] : [])]));
  const batches = await Promise.all([
    ...domains.map((cookieDomain) => chrome.cookies.getAll({ domain: cookieDomain }) as Promise<ChromeCookie[]>),
    chrome.cookies.getAll({ url: rootUrl }) as Promise<ChromeCookie[]>,
  ]);

  return uniqueCookies(batches.flat()).filter((cookie) => cookieDomainMatches(cookie, domain));
}

function uniqueCookies(cookies: ChromeCookie[]): ChromeCookie[] {
  const seen = new Set<string>();
  const unique: ChromeCookie[] = [];

  for (const cookie of cookies) {
    const key = [cookie.storeId ?? "", cookie.domain ?? "", cookie.path ?? "", cookie.name].join("\n");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(cookie);
  }

  return unique;
}

export function normalizeSettings(settings: Partial<ExtensionSettings> & { domains?: unknown }): ExtensionSettings {
  const rawInterval = Number(settings.refreshIntervalMinutes ?? DEFAULT_SETTINGS.refreshIntervalMinutes);
  const refreshIntervalMinutes = Number.isFinite(rawInterval)
    ? Math.min(1440, Math.max(5, Math.round(rawInterval)))
    : DEFAULT_SETTINGS.refreshIntervalMinutes;
  const rawDomains = Array.isArray(settings.domains) ? settings.domains : DEFAULT_SETTINGS.domains;

  return {
    enabled: typeof settings.enabled === "boolean" ? settings.enabled : DEFAULT_SETTINGS.enabled,
    domains: normalizeSettingsDomains(rawDomains),
    refreshIntervalMinutes,
  };
}

export function settingsFromUserConfig(config: UserConfig): ExtensionSettings {
  return normalizeSettings({
    enabled: config.cookieSyncEnabled,
    domains: config.protectedDomains,
    refreshIntervalMinutes: config.refreshIntervalMinutes,
  });
}

export function userConfigFromSettings(settings: ExtensionSettings, base: UserConfig = DEFAULT_USER_CONFIG): UserConfig {
  const domains = validateSettingsDomains(settings.domains);
  const validation = normalizeUserConfig({
    ...base,
    protectedDomains: domains,
    cookieSyncEnabled: settings.enabled,
    refreshIntervalMinutes: settings.refreshIntervalMinutes,
  });

  if (!validation.ok) {
    throw new Error(validation.errors.join("; "));
  }

  return validation.value;
}

export function normalizeSettingsDomains(rawDomains: unknown[]): string[] {
  const domains: string[] = [];
  const seen = new Set<string>();

  for (const rawDomain of rawDomains) {
    const candidate = String(rawDomain ?? "").trim();
    if (!candidate) continue;

    const validation = validateExactDomain(candidate);
    const domain = validation.ok ? validation.value : candidate;
    const key = validation.ok ? validation.value : candidate.toLowerCase();

    if (validation.ok && validation.value === DEFAULT_AUTH_DOMAIN) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    domains.push(domain);
  }

  return domains;
}

export function validateSettingsDomains(domains: string[]): string[] {
  if (!Array.isArray(domains)) {
    throw new Error("Protected domains must be an array");
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  const errors: string[] = [];

  domains.forEach((domain, index) => {
    const validation = validateExactDomain(domain);
    if (!validation.ok) {
      errors.push(...validation.errors.map((error) => `domains[${index}] ${error}`));
      return;
    }
    if (seen.has(validation.value)) return;
    seen.add(validation.value);
    normalized.push(validation.value);
  });

  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }

  return normalized;
}

function summarizeDomainErrors(statuses: DomainSyncState[]): string | undefined {
  const failures = statuses.filter((status) => status.error);
  if (failures.length === 0) return undefined;

  const prefix = failures.length === statuses.length ? "No domains synced" : "Some domains did not sync";
  return `${prefix}: ${failures.map((status) => `${status.domain}: ${status.error}`).join("; ")}`;
}

function assertPersistedUserConfigMatchesSettings(
  userConfig: { config?: Partial<UserConfig> },
  expectedConfig: UserConfig,
): void {
  const persistedDomains = userConfig.config?.protectedDomains;

  if (!Array.isArray(persistedDomains) || !sameDomains(persistedDomains, expectedConfig.protectedDomains)) {
    throw new Error(
      "Native host did not persist protectedDomains. Reinstall the macOS native host from the current build, then save settings again.",
    );
  }
}

function sameDomains(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((domain, index) => domain === right[index]);
}
