import { describe, expect, it } from "vitest";
import {
  DEFAULT_USER_CONFIG,
  DEFAULT_USER_AUTH_CONFIG_PATH,
  DEFAULT_USER_CONFIG_PATH,
  normalizeUserConfig,
} from "../packages/shared/src/index";

describe("centralized user config", () => {
  it("uses a cross-platform home directory dotfolder by default", () => {
    expect(DEFAULT_USER_CONFIG_PATH).toBe("~/.obsidian-image-clipper/config.json");
    expect(DEFAULT_USER_AUTH_CONFIG_PATH).toBe("~/.obsidian-image-clipper/auth.json");
    expect(DEFAULT_USER_CONFIG.authConfigPath).toBe(DEFAULT_USER_AUTH_CONFIG_PATH);
    expect(DEFAULT_USER_CONFIG.protectedDomains).toEqual([]);
  });

  it("uses an empty protected domain list when the field is omitted", () => {
    const result = normalizeUserConfig({
      version: 1,
      cookieSyncEnabled: false,
      refreshIntervalMinutes: 15,
      authDownloadsEnabled: true,
      authConfigPath: "~/.obsidian-image-clipper/auth.json",
      authConfigStaleMinutes: 240,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      ...DEFAULT_USER_CONFIG,
      protectedDomains: [],
      cookieSyncEnabled: false,
      refreshIntervalMinutes: 15,
      authConfigStaleMinutes: 240,
    });
  });

  it("normalizes multiple protected domains while preserving order", () => {
    const result = normalizeUserConfig({
      version: 1,
      protectedDomains: [" Secure.Example.COM ", "assets.example.com", "secure.example.com"],
      cookieSyncEnabled: true,
      refreshIntervalMinutes: 30,
      authDownloadsEnabled: true,
      authConfigPath: "~/.obsidian-image-clipper/auth.json",
      authConfigStaleMinutes: 120,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.protectedDomains).toEqual(["secure.example.com", "assets.example.com"]);
  });

  it("treats the example domain as an empty placeholder", () => {
    const result = normalizeUserConfig({
      ...DEFAULT_USER_CONFIG,
      protectedDomains: ["protected.example.com", "real.example.com"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.protectedDomains).toEqual(["real.example.com"]);
  });

  it("rejects invalid config values", () => {
    const result = normalizeUserConfig({
      version: 2,
      protectedDomains: ["https://protected.example.com/path"],
      cookieSyncEnabled: "yes",
      refreshIntervalMinutes: 1,
      authDownloadsEnabled: "yes",
      authConfigPath: "",
      authConfigStaleMinutes: 1,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("version must be 1");
    expect(result.errors.join("\n")).toContain("protectedDomains[0]");
    expect(result.errors.join("\n")).toContain("cookieSyncEnabled");
    expect(result.errors.join("\n")).toContain("authConfigPath");
  });

  it("accepts an empty protected domain list for first-run setup", () => {
    const result = normalizeUserConfig({
      ...DEFAULT_USER_CONFIG,
      protectedDomains: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.protectedDomains).toEqual([]);
  });
});
