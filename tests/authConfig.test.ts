import { describe, expect, it } from "vitest";
import {
  AUTH_CONFIG_VERSION,
  buildCookieHeader,
  buildCookieHeaderForUrl,
  earliestCookieExpiration,
  getAuthHeadersForUrl,
  maskSecrets,
  validateAuthConfig,
  validateExactDomain,
} from "../packages/shared/src/index";

describe("auth config", () => {
  it("rejects broad or malformed domains", () => {
    expect(validateExactDomain("*").ok).toBe(false);
    expect(validateExactDomain("https://protected.example.com").ok).toBe(false);
    expect(validateExactDomain("protected.example.com:443").ok).toBe(false);
    expect(validateExactDomain("protected.example.com/path").ok).toBe(false);
    expect(validateExactDomain(".protected.example.com").ok).toBe(false);
    expect(validateExactDomain("protected.example.com.").ok).toBe(false);
    expect(validateExactDomain("protected.-example.com").ok).toBe(false);
    expect(validateExactDomain("localhost").ok).toBe(false);
  });

  it("normalizes valid exact domains", () => {
    const result = validateExactDomain(" Protected.Example.COM ");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe("protected.example.com");
  });

  it("matches exact host only", () => {
    const config = {
      version: AUTH_CONFIG_VERSION,
      updatedAt: new Date().toISOString(),
      rules: [{ domain: "protected.example.com", headers: { Cookie: "a=b" } }],
    };
    const validated = validateAuthConfig(config);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(getAuthHeadersForUrl(validated.value, "https://protected.example.com/asset/a")?.Cookie).toBe("a=b");
    expect(getAuthHeadersForUrl(validated.value, "https://static.protected.example.com/asset/a")).toBeNull();
  });

  it("rejects duplicate domains and unsupported headers", () => {
    const config = {
      version: AUTH_CONFIG_VERSION,
      updatedAt: new Date().toISOString(),
      rules: [
        { domain: "protected.example.com", headers: { Cookie: "a=b", Authorization: "Bearer secret" } },
        { domain: "protected.example.com", headers: { Cookie: "c=d" } },
      ],
    };
    const validated = validateAuthConfig(config);
    expect(validated.ok).toBe(false);
    if (validated.ok) return;
    expect(validated.errors.join("\n")).toContain("unsupported headers");
    expect(validated.errors.join("\n")).toContain("duplicate domains");
  });

  it("builds cookie headers and earliest expiry", () => {
    const cookies = [
      { name: "foo", value: "bar", expirationDate: 200 },
      { name: "sid", value: "abc", expirationDate: 100 },
    ];
    expect(buildCookieHeader(cookies)).toBe("foo=bar; sid=abc");
    expect(earliestCookieExpiration(cookies, 1)).toBe(new Date(100000).toISOString());
  });

  it("builds per-url cookie headers from structured cookies", () => {
    expect(
      buildCookieHeaderForUrl(
        [
          { name: "parent", value: "1", domain: ".example.test", path: "/" },
          { name: "asset", value: "2", domain: "kb.example.test", path: "/asset" },
          { name: "passport", value: "3", domain: "login.example.test", path: "/" },
          { name: "secure", value: "4", domain: "kb.example.test", path: "/", secure: true },
        ],
        "https://kb.example.test/asset/image",
        1,
      ),
    ).toBe("parent=1; asset=2; secure=4");
  });

  it("prefers structured cookies when resolving auth headers", () => {
    const config = {
      version: AUTH_CONFIG_VERSION,
      updatedAt: new Date().toISOString(),
      rules: [
        {
          domain: "kb.example.test",
          headers: { Cookie: "legacy=1", Referer: "https://kb.example.test/" },
          cookies: [
            { name: "parent", value: "1", domain: ".example.test", path: "/" },
            { name: "asset", value: "2", domain: "kb.example.test", path: "/asset" },
          ],
        },
      ],
    };
    const validated = validateAuthConfig(config);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    expect(getAuthHeadersForUrl(validated.value, "https://kb.example.test/asset/image")).toEqual({
      Cookie: "parent=1; asset=2",
      Referer: "https://kb.example.test/",
    });
  });

  it("masks secrets recursively", () => {
    expect(maskSecrets({ headers: { Cookie: "sid=abc; foo=bar" } })).toEqual({
      headers: { Cookie: "<redacted>" },
    });
    expect(maskSecrets({ cookies: [{ name: "sid", value: "secret", domain: ".example.com" }] })).toEqual({
      cookies: [{ name: "sid", value: "<redacted>", domain: ".example.com" }],
    });
  });
});
