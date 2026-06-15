import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AUTH_CONFIG_VERSION } from "../packages/shared/src/index";
import { readAuthConfigMetadata, writeAuthConfigFile } from "../apps/native-host/src/authFile";
import { readUserConfigFile, writeUserConfigFile } from "../apps/native-host/src/userConfigFile";

describe("native auth file", () => {
  it("writes auth files with owner-only permissions", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oic-auth-"));
    const filePath = path.join(dir, "auth.json");

    await writeAuthConfigFile(
      {
        version: AUTH_CONFIG_VERSION,
        updatedAt: new Date().toISOString(),
        rules: [{ domain: "protected.example.com", headers: { Cookie: "sid=abc" } }],
      },
      filePath,
    );

    const stat = await fs.stat(filePath);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("returns metadata without cookie values", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oic-auth-"));
    const filePath = path.join(dir, "auth.json");

    await writeAuthConfigFile(
      {
        version: AUTH_CONFIG_VERSION,
        updatedAt: new Date().toISOString(),
        rules: [{ domain: "protected.example.com", headers: { Cookie: "sid=secret", Referer: "https://protected.example.com/" } }],
      },
      filePath,
    );

    const metadata = await readAuthConfigMetadata(filePath);
    expect(JSON.stringify(metadata)).not.toContain("sid=secret");
    expect(metadata.rules[0]).toMatchObject({
      domain: "protected.example.com",
      hasCookie: true,
      hasReferer: true,
    });
  });

  it("reads and writes centralized user config with owner-only permissions", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oic-user-config-"));
    const filePath = path.join(dir, "config.json");

    await writeUserConfigFile(
      {
        version: 1,
        protectedDomains: [" Secure.Example.COM ", "assets.example.com"],
        cookieSyncEnabled: false,
        refreshIntervalMinutes: 10,
        authDownloadsEnabled: true,
        authConfigPath: "~/.obsidian-image-clipper/auth.json",
        authConfigStaleMinutes: 120,
      },
      filePath,
    );

    const stat = await fs.stat(filePath);
    const result = await readUserConfigFile(filePath);

    expect(stat.mode & 0o777).toBe(0o600);
    expect(result.exists).toBe(true);
    expect(result.config.protectedDomains).toEqual(["secure.example.com", "assets.example.com"]);
    expect(result.config.cookieSyncEnabled).toBe(false);
  });
});
