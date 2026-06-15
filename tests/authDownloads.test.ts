import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearAuthConfigCache, loadAuthConfig } from "../apps/obsidian-plugin/src/authDownloads";
import { ISettings } from "../apps/obsidian-plugin/src/config";
import { AUTH_CONFIG_VERSION } from "../packages/shared/src/index";

describe("obsidian auth downloads", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearAuthConfigCache();
  });

  it("caches a valid auth config until the auth file mtime changes", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "oic-auth-cache-"));
    const authPath = path.join(dir, "auth.json");
    const settings = {
      authDownloadsEnabled: true,
      authConfigPath: authPath,
      authConfigStaleMinutes: 120,
    } as ISettings;
    const readFile = vi.spyOn(fs.promises, "readFile");

    await writeAuthConfig(authPath, "first=1");
    const first = await loadAuthConfig(settings);
    const second = await loadAuthConfig(settings);

    expect(first.config?.rules[0].headers.Cookie).toBe("first=1");
    expect(second.config?.rules[0].headers.Cookie).toBe("first=1");
    expect(readFile.mock.calls.filter((call) => call[0] === authPath)).toHaveLength(1);

    await writeAuthConfig(authPath, "second=2");
    await fsp.utimes(authPath, new Date(), new Date(Date.now() + 2000));
    const refreshed = await loadAuthConfig(settings);

    expect(refreshed.config?.rules[0].headers.Cookie).toBe("second=2");
    expect(readFile.mock.calls.filter((call) => call[0] === authPath)).toHaveLength(2);
  });
});

async function writeAuthConfig(filePath: string, cookie: string): Promise<void> {
  await fsp.writeFile(
    filePath,
    JSON.stringify({
      version: AUTH_CONFIG_VERSION,
      updatedAt: new Date().toISOString(),
      rules: [{ domain: "secure.example.com", headers: { Cookie: cookie } }],
    }),
  );
}
