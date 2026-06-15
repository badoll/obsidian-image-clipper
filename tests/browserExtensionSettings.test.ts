import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../apps/browser-extension/src/constants";
import { describeNativeMessagingError, normalizeSettings } from "../apps/browser-extension/src/cookieSync";
import { getCurrentTabDomain } from "../apps/browser-extension/src/currentTab";
import {
  domainsToPermissionOrigins,
  domainToCookieUrl,
  domainToPermissionOrigin,
  domainToPermissionOrigins,
  requestDomainsPermission,
  requestDomainPermission,
} from "../apps/browser-extension/src/permissions";
import { buildHealthItems, describeUserConfigStatus, getVisibleSyncError } from "../apps/browser-extension/src/ui";
import { DEFAULT_USER_CONFIG } from "../packages/shared/src/index";

describe("browser extension settings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes stored settings with safe defaults", () => {
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ enabled: false, domains: [" Protected.Example.COM "], refreshIntervalMinutes: 1 })).toEqual({
      enabled: false,
      domains: [],
      refreshIntervalMinutes: 5,
    });
    expect(normalizeSettings({ enabled: false, domains: [" Secure.Example.COM "], refreshIntervalMinutes: 1 })).toEqual({
      enabled: false,
      domains: ["secure.example.com"],
      refreshIntervalMinutes: 5,
    });
    expect(normalizeSettings({ domains: [" secure.example.com ", "secure.example.com", "assets.example.com"] }).domains).toEqual([
      "secure.example.com",
      "assets.example.com",
    ]);
    expect(normalizeSettings({ domains: ["protected.example.com", "secure.example.com"] }).domains).toEqual([
      "secure.example.com",
    ]);
    expect(normalizeSettings({ refreshIntervalMinutes: 99999 }).refreshIntervalMinutes).toBe(1440);
  });

  it("hides stale placeholder sync errors after settings are normalized", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      domains: ["kb.example.test"],
    };

    expect(
      getVisibleSyncError(settings, {
        lastError: "Some domains did not sync: protected.example.com: No cookies found",
        domains: [{ domain: "protected.example.com", error: "No cookies found" }],
      }),
    ).toBeUndefined();

    expect(
      getVisibleSyncError(settings, {
        lastError: "Some domains did not sync: protected.example.com: No cookies found",
        domains: [
          { domain: "kb.example.test", cookieCount: 3 },
          { domain: "protected.example.com", error: "No cookies found" },
        ],
      }),
    ).toBeUndefined();

    expect(
      getVisibleSyncError(settings, {
        lastError: "Native host did not accept the auth config",
        domains: [{ domain: "kb.example.test", cookieCount: 3 }],
      }),
    ).toBe("Native host did not accept the auth config");
  });

  it("explains forbidden native host access with the current extension id", () => {
    expect(
      describeNativeMessagingError(
        new Error("Access to the specified native messaging host is forbidden."),
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
    ).toContain("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(
      describeNativeMessagingError(
        new Error("Access to the specified native messaging host is forbidden."),
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
    ).toContain("Re-run the macOS native host installer");
  });

  it("builds exact host permission and cookie URL patterns", () => {
    expect(domainToPermissionOrigin("protected.example.com")).toEqual({
      ok: true,
      value: "https://protected.example.com/*",
      errors: [],
    });
    expect(domainToCookieUrl("protected.example.com")).toEqual({
      ok: true,
      value: "https://protected.example.com/",
      errors: [],
    });
    expect(domainToPermissionOrigin("https://protected.example.com").ok).toBe(false);
  });

  it("includes parent-domain permission patterns for SSO cookies", () => {
    expect(domainToPermissionOrigins("kb.example.test")).toEqual({
      ok: true,
      value: ["https://kb.example.test/*", "https://example.test/*", "https://*.example.test/*"],
      errors: [],
    });
  });

  it("combines host permission patterns for multiple domains", () => {
    expect(domainsToPermissionOrigins(["kb.example.test", "assets.example.com"])).toEqual({
      ok: true,
      value: [
        "https://kb.example.test/*",
        "https://example.test/*",
        "https://*.example.test/*",
        "https://assets.example.com/*",
        "https://example.com/*",
        "https://*.example.com/*",
      ],
      errors: [],
    });
  });

  it("requests optional host access for the configured domain", async () => {
    const request = vi.fn((_request: unknown, callback: (granted: boolean) => void) => callback(true));
    vi.stubGlobal("chrome", {
      runtime: { lastError: undefined },
      permissions: { request },
    });

    const result = await requestDomainPermission(" Kb.Example.TEST ");

    expect(request).toHaveBeenCalledWith(
      { origins: ["https://kb.example.test/*", "https://example.test/*", "https://*.example.test/*"] },
      expect.any(Function),
    );
    expect(result).toMatchObject({
      domain: "kb.example.test",
      granted: true,
      hasPermission: true,
      errors: [],
    });
  });

  it("requests optional host access for all configured domains", async () => {
    const request = vi.fn((_request: unknown, callback: (granted: boolean) => void) => callback(true));
    const contains = vi.fn((_request: unknown, callback: (granted: boolean) => void) => callback(true));
    vi.stubGlobal("chrome", {
      runtime: { lastError: undefined },
      permissions: { request, contains },
    });

    const result = await requestDomainsPermission(["kb.example.test", "assets.example.com"]);

    expect(request).toHaveBeenCalledWith(
      {
        origins: [
          "https://kb.example.test/*",
          "https://example.test/*",
          "https://*.example.test/*",
          "https://assets.example.com/*",
          "https://example.com/*",
          "https://*.example.com/*",
        ],
      },
      expect.any(Function),
    );
    expect(result.granted).toBe(true);
    expect(result.statuses.map((status) => status.domain)).toEqual(["kb.example.test", "assets.example.com"]);
  });

  it("does not request host access when no domains are configured", async () => {
    const request = vi.fn();
    vi.stubGlobal("chrome", {
      runtime: { lastError: undefined },
      permissions: { request },
    });

    const result = await requestDomainsPermission([]);

    expect(request).not.toHaveBeenCalled();
    expect(result).toEqual({
      origins: [],
      statuses: [],
      granted: true,
      errors: [],
    });
  });

  it("extracts the active web tab hostname for current-domain prefill", async () => {
    vi.stubGlobal("chrome", {
      tabs: {
        query: vi.fn(async () => [{ url: "https://Secure.Example.com/path" }]),
      },
    });

    await expect(getCurrentTabDomain()).resolves.toMatchObject({ domain: "secure.example.com" });

    vi.stubGlobal("chrome", {
      tabs: {
        query: vi.fn(async () => [{ url: "http://docs.example.com/page" }]),
      },
    });

    await expect(getCurrentTabDomain()).resolves.toMatchObject({ domain: "docs.example.com" });
  });

  it("ignores non-web active tabs for current-domain prefill", async () => {
    vi.stubGlobal("chrome", {
      tabs: {
        query: vi.fn(async () => [{ url: "chrome://extensions" }]),
      },
    });

    const result = await getCurrentTabDomain();
    expect(result.domain).toBeUndefined();
    expect(result.error).toContain("not a web URL");
  });

  it("describes centralized config status visibly for the options page", () => {
    expect(describeUserConfigStatus(undefined)).toMatchObject({
      status: "Not checked",
      tone: "idle",
    });

    expect(describeUserConfigStatus({ error: "Native host user config read failed" })).toMatchObject({
      status: "Native host user config read failed",
      tone: "bad",
    });

    expect(
      describeUserConfigStatus({
        path: "/tmp/config.json",
        exists: false,
        config: DEFAULT_USER_CONFIG,
        errors: [],
      }),
    ).toMatchObject({
      path: "/tmp/config.json",
      status: "Missing; install the native host or save settings to create it",
      tone: "idle",
    });

    expect(
      describeUserConfigStatus({
        path: "/tmp/config.json",
        exists: true,
        config: DEFAULT_USER_CONFIG,
        errors: [],
      }),
    ).toMatchObject({
      path: "/tmp/config.json",
      status: "Loaded",
      tone: "good",
    });
  });

  it("builds a user-facing health checklist for options", () => {
    const items = buildHealthItems(
      { enabled: true, domains: ["secure.example.com", "assets.example.com"], refreshIntervalMinutes: 30 },
      {
        lastSyncAt: new Date().toISOString(),
        domains: [
          { domain: "secure.example.com", cookieCount: 2 },
          { domain: "assets.example.com", error: "No cookies found" },
        ],
      },
      {
        path: "/tmp/config.json",
        exists: true,
        config: { ...DEFAULT_USER_CONFIG, protectedDomains: ["secure.example.com", "assets.example.com"] },
        errors: [],
      },
      [
        { domain: "secure.example.com", hasPermission: true, errors: [] },
        { domain: "assets.example.com", hasPermission: false, origin: "https://assets.example.com/*", errors: [] },
      ],
      {
        exists: true,
        rules: [{ domain: "secure.example.com" }],
      },
    );

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Browser extension", status: "Loaded", tone: "good" }),
        expect.objectContaining({ label: "Native host", status: "Connected", tone: "good" }),
        expect.objectContaining({ label: "Config writable", status: "Ready", tone: "good" }),
        expect.objectContaining({ label: "Domains configured", status: "2 domains", tone: "good" }),
        expect.objectContaining({
          label: "Permissions granted",
          status: "Missing assets.example.com",
          tone: "bad",
        }),
        expect.objectContaining({
          label: "Cookies synced",
          status: "Some domains did not sync: assets.example.com: No cookies found",
          tone: "bad",
        }),
        expect.objectContaining({ label: "Obsidian auth file", status: "1 matching rules", tone: "good" }),
      ]),
    );
  });
});
