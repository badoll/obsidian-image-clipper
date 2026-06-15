import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../apps/browser-extension/src/constants";
import {
  collectCookiesForDomain,
  getSettings,
  loadSettingsFromUserConfig,
  saveSettings,
  syncCookiesNow,
  writeUserConfigFromSettings,
} from "../apps/browser-extension/src/cookieSync";
import { DEFAULT_USER_CONFIG } from "../packages/shared/src/index";

type FakeChromeOptions = {
  hasPermission?: boolean;
  cookies?:
    | Array<{
        name: string;
        value: string;
        domain?: string;
        path?: string;
        secure?: boolean;
        hostOnly?: boolean;
        storeId?: string;
        expirationDate?: number;
      }>
    | ((
        details: { domain?: string; url?: string },
      ) => Array<{
        name: string;
        value: string;
        domain?: string;
        path?: string;
        secure?: boolean;
        hostOnly?: boolean;
        storeId?: string;
        expirationDate?: number;
      }>);
  nativeResponse?: unknown;
  userConfig?: unknown;
  writeUserConfigResponse?: unknown;
};

describe("browser extension cookie sync", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("persists normalized settings", async () => {
    installFakeChrome();

    await saveSettings({
      enabled: false,
      domains: [" Secure.Example.COM "],
      refreshIntervalMinutes: 2,
    });

    expect(await getSettings()).toEqual({
      enabled: false,
      domains: ["secure.example.com"],
      refreshIntervalMinutes: 5,
    });
  });

  it("filters the example placeholder out of stored settings", async () => {
    const fake = installFakeChrome();
    fake.store.settings = {
      enabled: true,
      domains: ["protected.example.com", "secure.example.com"],
      refreshIntervalMinutes: 30,
    };

    expect(await getSettings()).toEqual({
      enabled: true,
      domains: ["secure.example.com"],
      refreshIntervalMinutes: 30,
    });
  });

  it("treats an empty domain list as first-run setup instead of a sync error", async () => {
    const fake = installFakeChrome();
    await saveSettings(DEFAULT_SETTINGS);

    const state = await syncCookiesNow();

    expect(state.lastError).toBeUndefined();
    expect(state.lastCookieCount).toBe(0);
    expect(state.permissionMissing).toBe(false);
    expect(state.domains).toEqual([]);
    expect(fake.cookiesGetAll).not.toHaveBeenCalled();
  });

  it("reports missing host permission before reading cookies", async () => {
    const fake = installFakeChrome({ hasPermission: false });
    await saveSettings({
      ...DEFAULT_SETTINGS,
      domains: ["secure.example.com"],
    });

    const state = await syncCookiesNow();

    expect(state.permissionMissing).toBe(true);
    expect(state.permissionOrigin).toBe("https://secure.example.com/*");
    expect(state.domains?.[0]).toMatchObject({
      domain: "secure.example.com",
      permissionMissing: true,
    });
    expect(String(state.lastError)).toContain("Browser host permission is missing");
    expect(fake.cookiesGetAll).not.toHaveBeenCalled();
  });

  it("reports empty cookie state without writing native config", async () => {
    const fake = installFakeChrome({ hasPermission: true, cookies: [] });
    await saveSettings({
      ...DEFAULT_SETTINGS,
      domains: ["secure.example.com"],
    });

    const state = await syncCookiesNow();

    expect(state.lastError).toContain("No cookies found");
    expect(state.domains?.[0]).toMatchObject({
      domain: "secure.example.com",
      error: expect.stringContaining("No cookies found"),
    });
    expect(fake.sendNativeMessage).not.toHaveBeenCalled();
  });

  it("writes an auth config to the native host after successful sync", async () => {
    const fake = installFakeChrome({
      hasPermission: true,
      cookies: [
        { name: "sid", value: "abc", expirationDate: 4_102_444_800 },
        { name: "pref", value: "dark" },
      ],
      nativeResponse: { ok: true, metadata: { rules: [{ domain: "secure.example.com", hasCookie: true }] } },
    });
    await saveSettings({
      ...DEFAULT_SETTINGS,
      domains: ["secure.example.com"],
    });

    const state = await syncCookiesNow();
    const [, message] = fake.sendNativeMessage.mock.calls[0];

    expect(state.lastError).toBeUndefined();
    expect(state.lastCookieCount).toBe(2);
    expect(message.config.rules[0]).toMatchObject({
      domain: "secure.example.com",
      headers: {
        Cookie: "sid=abc; pref=dark",
        Referer: "https://secure.example.com/",
      },
    });
  });

  it("writes one auth rule for each domain that syncs successfully", async () => {
    const fake = installFakeChrome({
      hasPermission: true,
      cookies: (details) => {
        if (details.domain === "secure.example.com" || details.url === "https://secure.example.com/") {
          return [{ name: "secure_sid", value: "abc", domain: "secure.example.com", path: "/" }];
        }
        if (details.domain === "assets.example.com" || details.url === "https://assets.example.com/") {
          return [{ name: "asset_sid", value: "def", domain: "assets.example.com", path: "/" }];
        }
        return [];
      },
      nativeResponse: { ok: true, metadata: { rules: [] } },
    });
    await saveSettings({
      enabled: true,
      domains: ["secure.example.com", "assets.example.com"],
      refreshIntervalMinutes: 30,
    });

    const state = await syncCookiesNow();
    const [, message] = fake.sendNativeMessage.mock.calls[0];

    expect(state.lastError).toBeUndefined();
    expect(state.lastCookieCount).toBe(2);
    expect(message.config.rules.map((rule: { domain: string }) => rule.domain)).toEqual([
      "secure.example.com",
      "assets.example.com",
    ]);
    expect(message.config.rules[0].headers.Cookie).toBe("secure_sid=abc");
    expect(message.config.rules[1].headers.Cookie).toBe("asset_sid=def");
  });

  it("keeps per-domain failure state while writing successful rules", async () => {
    const fake = installFakeChrome({
      hasPermission: true,
      cookies: (details) => {
        if (details.domain === "secure.example.com" || details.url === "https://secure.example.com/") {
          return [{ name: "secure_sid", value: "abc", domain: "secure.example.com", path: "/" }];
        }
        return [];
      },
      nativeResponse: { ok: true, metadata: { rules: [] } },
    });
    await saveSettings({
      enabled: true,
      domains: ["secure.example.com", "empty.example.com"],
      refreshIntervalMinutes: 30,
    });

    const state = await syncCookiesNow();
    const [, message] = fake.sendNativeMessage.mock.calls[0];

    expect(message.config.rules.map((rule: { domain: string }) => rule.domain)).toEqual(["secure.example.com"]);
    expect(state.lastError).toContain("Some domains did not sync");
    expect(state.domains).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ domain: "secure.example.com", cookieCount: 1 }),
        expect.objectContaining({ domain: "empty.example.com", error: expect.stringContaining("No cookies found") }),
      ]),
    );
  });

  it("collects domain cookies in addition to root-url cookies", async () => {
    const fake = installFakeChrome({
      cookies: (details) => {
        if (details.domain === "example.test") {
          return [
            { name: "parent_session", value: "parent", domain: ".example.test", path: "/" },
            { name: "passport_only", value: "skip", domain: "login.example.test", path: "/" },
          ];
        }

        if (details.domain === "kb.example.test") {
          return [
            { name: "asset_session", value: "path", domain: "kb.example.test", path: "/asset" },
            { name: "root_session", value: "domain", domain: "kb.example.test", path: "/" },
          ];
        }

        return [{ name: "root_session", value: "domain", domain: "kb.example.test", path: "/" }];
      },
    });

    const cookies = await collectCookiesForDomain("kb.example.test", "https://kb.example.test/");

    expect(fake.cookiesGetAll).toHaveBeenCalledWith({ domain: "kb.example.test" });
    expect(fake.cookiesGetAll).toHaveBeenCalledWith({ domain: "example.test" });
    expect(fake.cookiesGetAll).toHaveBeenCalledWith({ url: "https://kb.example.test/" });
    expect(cookies.map((cookie) => cookie.name)).toEqual(["asset_session", "root_session", "parent_session"]);
  });

  it("loads extension settings from the centralized user config", async () => {
    installFakeChrome({
      userConfig: {
        path: "/tmp/config.json",
        exists: true,
        config: {
          ...DEFAULT_USER_CONFIG,
          protectedDomains: ["secure.example.com", "assets.example.com"],
          cookieSyncEnabled: false,
          refreshIntervalMinutes: 45,
        },
        errors: [],
      },
    });

    const { settings } = await loadSettingsFromUserConfig();

    expect(settings).toEqual({
      enabled: false,
      domains: ["secure.example.com", "assets.example.com"],
      refreshIntervalMinutes: 45,
    });
    expect(await getSettings()).toEqual(settings);
  });

  it("writes extension settings back to centralized user config without replacing plugin fields", async () => {
    const fake = installFakeChrome({
      userConfig: {
        path: "/tmp/config.json",
        exists: true,
        config: {
          ...DEFAULT_USER_CONFIG,
          authDownloadsEnabled: false,
          authConfigPath: "~/custom/auth.json",
          authConfigStaleMinutes: 300,
        },
        errors: [],
      },
    });

    await writeUserConfigFromSettings({
      enabled: false,
      domains: ["secure.example.com", "assets.example.com"],
      refreshIntervalMinutes: 60,
    });

    const writeCall = fake.sendNativeMessage.mock.calls.find(([, message]) => message.type === "writeUserConfig");
    expect(writeCall?.[1].config).toMatchObject({
      protectedDomains: ["secure.example.com", "assets.example.com"],
      cookieSyncEnabled: false,
      refreshIntervalMinutes: 60,
      authDownloadsEnabled: false,
      authConfigPath: "~/custom/auth.json",
      authConfigStaleMinutes: 300,
    });
  });

  it("reports an outdated native host when protectedDomains are not persisted", async () => {
    installFakeChrome({
      writeUserConfigResponse: {
        ok: true,
        userConfig: {
          path: "/tmp/config.json",
          exists: true,
          config: {
            ...DEFAULT_USER_CONFIG,
            protectedDomains: undefined,
          },
          errors: [],
        },
      },
    });

    await expect(
      writeUserConfigFromSettings({
        enabled: true,
        domains: ["secure.example.com", "assets.example.com"],
        refreshIntervalMinutes: 30,
      }),
    ).rejects.toThrow("Reinstall the macOS native host");
  });
});

function installFakeChrome(options: FakeChromeOptions = {}) {
  const store: Record<string, unknown> = {};
  const hasPermission = options.hasPermission ?? true;
  const cookies = options.cookies ?? [{ name: "sid", value: "abc" }];
  const nativeResponse = options.nativeResponse ?? { ok: true, metadata: { rules: [] } };
  const writeUserConfigResponse = options.writeUserConfigResponse;
  const userConfig = options.userConfig ?? {
    path: "/tmp/config.json",
    exists: false,
    config: DEFAULT_USER_CONFIG,
    errors: [],
  };
  const cookiesGetAll = vi.fn(async (details: { domain?: string; url?: string }) =>
    typeof cookies === "function" ? cookies(details) : cookies,
  );
  const sendNativeMessage = vi.fn(async (_hostName: string, message: { type?: string; config?: unknown }) => {
    if (message.type === "readUserConfig") return { ok: true, userConfig };
    if (message.type === "writeUserConfig") {
      if (writeUserConfigResponse) return writeUserConfigResponse;
      return {
        ok: true,
        userConfig: {
          path: "/tmp/config.json",
          exists: true,
          config: message.config,
          errors: [],
        },
      };
    }
    return nativeResponse;
  });

  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async (keys: string[]) => {
          const result: Record<string, unknown> = {};
          for (const key of keys) result[key] = store[key];
          return result;
        }),
        set: vi.fn(async (value: Record<string, unknown>) => {
          Object.assign(store, value);
        }),
      },
    },
    alarms: {
      clear: vi.fn(async () => true),
      create: vi.fn(),
    },
    cookies: {
      getAll: cookiesGetAll,
    },
    permissions: {
      contains: vi.fn((_request: unknown, callback: (result: boolean) => void) => callback(hasPermission)),
      request: vi.fn((_request: unknown, callback: (result: boolean) => void) => callback(hasPermission)),
    },
    runtime: {
      id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      lastError: undefined,
      sendNativeMessage,
    },
  });

  return { cookiesGetAll, sendNativeMessage, store };
}
