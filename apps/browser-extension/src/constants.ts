import { DEFAULT_AUTH_DOMAIN, DEFAULT_USER_CONFIG } from "../../../packages/shared/src/index";

export const HOST_NAME = "com.obsidian_image_clipper.cookie_sync";
export const DEFAULT_DOMAINS = DEFAULT_USER_CONFIG.protectedDomains;
export const DEFAULT_DOMAIN = DEFAULT_AUTH_DOMAIN;

export type ExtensionSettings = {
  enabled: boolean;
  domains: string[];
  refreshIntervalMinutes: number;
};

export const DEFAULT_SETTINGS = {
  enabled: DEFAULT_USER_CONFIG.cookieSyncEnabled,
  domains: DEFAULT_DOMAINS,
  refreshIntervalMinutes: DEFAULT_USER_CONFIG.refreshIntervalMinutes,
} satisfies ExtensionSettings;

export type DomainSyncState = {
  domain: string;
  lastSyncAt?: string;
  cookieCount?: number;
  permissionMissing?: boolean;
  permissionOrigin?: string;
  error?: string;
};

export type SyncState = {
  lastSyncAt?: string;
  lastError?: string;
  lastCookieCount?: number;
  permissionMissing?: boolean;
  permissionOrigin?: string;
  domains?: DomainSyncState[];
  nativeMetadata?: unknown;
};
