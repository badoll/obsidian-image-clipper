export const AUTH_CONFIG_VERSION = 1 as const;
export const DEFAULT_AUTH_DOMAIN = "protected.example.com";
export const DEFAULT_AUTH_URL = `https://${DEFAULT_AUTH_DOMAIN}/`;
export const DEFAULT_REFRESH_INTERVAL_MINUTES = 30;

export type BrowserSource = "chrome" | "edge";

export type AuthHeaders = {
  Cookie: string;
  Referer?: string;
};

export type AuthCookie = CookieLike & {
  domain?: string;
  path?: string;
  secure?: boolean;
  hostOnly?: boolean;
  storeId?: string;
};

export type AuthRule = {
  domain: string;
  headers: AuthHeaders;
  cookies?: AuthCookie[];
  expiresAt?: string;
  source?: {
    browser: BrowserSource;
    extensionId: string;
  };
};

export type AuthConfig = {
  version: typeof AUTH_CONFIG_VERSION;
  updatedAt: string;
  rules: AuthRule[];
};

export type AuthRuleMetadata = {
  domain: string;
  hasCookie: boolean;
  hasReferer: boolean;
  expiresAt?: string;
  source?: AuthRule["source"];
};

export type AuthConfigMetadata = {
  version?: number;
  updatedAt?: string;
  rules: AuthRuleMetadata[];
};

export type ValidationResult<T> =
  | { ok: true; value: T; errors: [] }
  | { ok: false; errors: string[] };

export type CookieLike = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  hostOnly?: boolean;
  storeId?: string;
  expirationDate?: number;
};

const SECRET_KEY_PATTERN = /^(cookie|authorization|proxy-authorization|set-cookie)$/i;

export function normalizeExactDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^\.+/, "");
}

export function validateExactDomain(domain: unknown): ValidationResult<string> {
  if (typeof domain !== "string") {
    return { ok: false, errors: ["domain must be a string"] };
  }

  const raw = domain.trim().toLowerCase();
  const normalized = normalizeExactDomain(domain);
  const errors: string[] = [];

  if (!normalized) errors.push("domain cannot be empty");
  if (normalized === "*") errors.push("wildcard domains are not allowed");
  if (raw.startsWith(".") || raw.endsWith(".")) errors.push("domain must not start or end with a dot");
  if (normalized.includes("://")) errors.push("domain must not include a protocol");
  if (normalized.includes("/")) errors.push("domain must not include a path");
  if (normalized.includes(":")) errors.push("domain must not include a port");
  if (/\s/.test(normalized)) errors.push("domain must not contain whitespace");
  if (!/^[a-z0-9.-]+$/.test(normalized)) errors.push("domain contains unsupported characters");
  if (normalized.includes("..")) errors.push("domain must not contain empty labels");
  if (!normalized.includes(".")) errors.push("domain must be a fully-qualified host");
  if (normalized.split(".").some((label) => label.startsWith("-") || label.endsWith("-"))) {
    errors.push("domain has invalid hyphen placement");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: normalized, errors: [] };
}

export function validateAuthConfig(input: unknown): ValidationResult<AuthConfig> {
  const errors: string[] = [];

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["auth config must be an object"] };
  }

  const value = input as Record<string, unknown>;

  if (value.version !== AUTH_CONFIG_VERSION) {
    errors.push(`version must be ${AUTH_CONFIG_VERSION}`);
  }

  if (typeof value.updatedAt !== "string" || Number.isNaN(Date.parse(value.updatedAt))) {
    errors.push("updatedAt must be an ISO date string");
  }

  if (!Array.isArray(value.rules)) {
    errors.push("rules must be an array");
  }

  const rules: AuthRule[] = [];

  if (Array.isArray(value.rules)) {
    value.rules.forEach((rawRule, index) => {
      if (!rawRule || typeof rawRule !== "object" || Array.isArray(rawRule)) {
        errors.push(`rules[${index}] must be an object`);
        return;
      }

      const rule = rawRule as Record<string, unknown>;
      const domainResult = validateExactDomain(rule.domain);
      if (!domainResult.ok) {
        errors.push(...domainResult.errors.map((error) => `rules[${index}].${error}`));
        return;
      }

      if (!rule.headers || typeof rule.headers !== "object" || Array.isArray(rule.headers)) {
        errors.push(`rules[${index}].headers must be an object`);
        return;
      }

      const headers = rule.headers as Record<string, unknown>;
      const headerKeys = Object.keys(headers);
      const unsupportedHeaders = headerKeys.filter((key) => key !== "Cookie" && key !== "Referer");

      if (unsupportedHeaders.length > 0) {
        errors.push(`rules[${index}].headers contains unsupported headers: ${unsupportedHeaders.join(", ")}`);
      }

      if (typeof headers.Cookie !== "string" || headers.Cookie.trim() === "") {
        errors.push(`rules[${index}].headers.Cookie must be a non-empty string`);
      }

      if (headers.Referer !== undefined && typeof headers.Referer !== "string") {
        errors.push(`rules[${index}].headers.Referer must be a string when present`);
      }

      let expiresAt: string | undefined;
      if (rule.expiresAt !== undefined) {
        if (typeof rule.expiresAt !== "string" || Number.isNaN(Date.parse(rule.expiresAt))) {
          errors.push(`rules[${index}].expiresAt must be an ISO date string when present`);
        } else {
          expiresAt = rule.expiresAt;
        }
      }

      let source: AuthRule["source"];
      if (rule.source !== undefined) {
        if (!rule.source || typeof rule.source !== "object" || Array.isArray(rule.source)) {
          errors.push(`rules[${index}].source must be an object when present`);
        } else {
          const rawSource = rule.source as Record<string, unknown>;
          if (rawSource.browser !== "chrome" && rawSource.browser !== "edge") {
            errors.push(`rules[${index}].source.browser must be chrome or edge`);
          }
          if (typeof rawSource.extensionId !== "string" || rawSource.extensionId.trim() === "") {
            errors.push(`rules[${index}].source.extensionId must be a non-empty string`);
          }
          if ((rawSource.browser === "chrome" || rawSource.browser === "edge") && typeof rawSource.extensionId === "string") {
            source = {
              browser: rawSource.browser,
              extensionId: rawSource.extensionId,
            };
          }
        }
      }

      if (typeof headers.Cookie === "string" && headers.Cookie.trim() !== "") {
        rules.push({
          domain: domainResult.value,
          headers: {
            Cookie: headers.Cookie,
            ...(typeof headers.Referer === "string" ? { Referer: headers.Referer } : {}),
          },
          ...(Array.isArray(rule.cookies) ? { cookies: normalizeAuthCookies(rule.cookies, index, errors) } : {}),
          ...(expiresAt ? { expiresAt } : {}),
          ...(source ? { source } : {}),
        });
      }
    });
  }

  const duplicatedDomains = new Set<string>();
  const seenDomains = new Set<string>();
  for (const rule of rules) {
    if (seenDomains.has(rule.domain)) {
      duplicatedDomains.add(rule.domain);
    }
    seenDomains.add(rule.domain);
  }

  if (duplicatedDomains.size > 0) {
    errors.push(`rules contain duplicate domains: ${Array.from(duplicatedDomains).join(", ")}`);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      version: AUTH_CONFIG_VERSION,
      updatedAt: value.updatedAt as string,
      rules,
    },
    errors: [],
  };
}

export function findExactRuleForUrl(config: AuthConfig, url: string): AuthRule | null {
  let hostname: string;

  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }

  return config.rules.find((rule) => hostname === rule.domain) ?? null;
}

export function getAuthHeadersForUrl(config: AuthConfig, url: string): AuthHeaders | null {
  const rule = findExactRuleForUrl(config, url);
  if (!rule) return null;
  if (rule.cookies && rule.cookies.length > 0) {
    const cookieHeader = buildCookieHeaderForUrl(rule.cookies, url);
    if (cookieHeader) {
      return {
        Cookie: cookieHeader,
        ...(rule.headers.Referer ? { Referer: rule.headers.Referer } : {}),
      };
    }
  }
  return { ...rule.headers };
}

export function buildCookieHeader(cookies: CookieLike[]): string {
  return cookies
    .filter((cookie) => cookie.name.trim() !== "" && cookie.value !== undefined)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

export function buildCookieHeaderForUrl(cookies: CookieLike[], url: string, nowSeconds = Date.now() / 1000): string {
  return buildCookieHeader(cookies.filter((cookie) => cookieMatchesUrl(cookie, url, nowSeconds)));
}

export function cookieMatchesUrl(cookie: CookieLike, url: string, nowSeconds = Date.now() / 1000): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (!cookie.name.trim() || cookie.value === undefined) return false;
  if (cookie.expirationDate !== undefined && cookie.expirationDate <= nowSeconds) return false;
  if (cookie.secure && parsed.protocol !== "https:") return false;
  if (!cookieDomainMatches(cookie, parsed.hostname.toLowerCase())) return false;

  const cookiePath = cookie.path || "/";
  return parsed.pathname === cookiePath || parsed.pathname.startsWith(cookiePath.endsWith("/") ? cookiePath : `${cookiePath}/`);
}

export function cookieDomainMatches(cookie: CookieLike, hostname: string): boolean {
  const cookieDomain = (cookie.domain || hostname).toLowerCase().replace(/^\./, "");
  if (!cookieDomain) return false;
  if (cookie.hostOnly) return hostname === cookieDomain;
  return hostname === cookieDomain || hostname.endsWith(`.${cookieDomain}`);
}

export function earliestCookieExpiration(cookies: CookieLike[], nowSeconds = Date.now() / 1000): string | undefined {
  const expirations = cookies
    .map((cookie) => cookie.expirationDate)
    .filter((expiration): expiration is number => typeof expiration === "number" && expiration > nowSeconds)
    .sort((a, b) => a - b);

  if (expirations.length === 0) return undefined;

  return new Date(expirations[0] * 1000).toISOString();
}

export function toAuthConfigMetadata(config: AuthConfig): AuthConfigMetadata {
  return {
    version: config.version,
    updatedAt: config.updatedAt,
    rules: config.rules.map((rule) => ({
      domain: rule.domain,
      hasCookie: Boolean(rule.headers.Cookie),
      hasReferer: Boolean(rule.headers.Referer),
      expiresAt: rule.expiresAt,
      source: rule.source,
    })),
  };
}

export function isAuthConfigStale(config: AuthConfig, staleMinutes: number, now = Date.now()): boolean {
  const updatedAt = Date.parse(config.updatedAt);
  if (Number.isNaN(updatedAt)) return true;
  return now - updatedAt > staleMinutes * 60 * 1000;
}

export function maskSecrets<T>(value: T): T {
  if (typeof value === "string") {
    return maskSecretString(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => maskSecrets(item)) as T;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const looksLikeCookie =
    typeof record.name === "string" &&
    "value" in record &&
    ("domain" in record || "path" in record || "secure" in record || "hostOnly" in record || "expirationDate" in record);
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    result[key] = SECRET_KEY_PATTERN.test(key) || (looksLikeCookie && key === "value") ? "<redacted>" : maskSecrets(entry);
  }

  return result as T;
}

function normalizeAuthCookies(rawCookies: unknown[], ruleIndex: number, errors: string[]): AuthCookie[] {
  const cookies: AuthCookie[] = [];

  rawCookies.forEach((rawCookie, cookieIndex) => {
    if (!rawCookie || typeof rawCookie !== "object" || Array.isArray(rawCookie)) {
      errors.push(`rules[${ruleIndex}].cookies[${cookieIndex}] must be an object`);
      return;
    }

    const cookie = rawCookie as Record<string, unknown>;
    if (typeof cookie.name !== "string" || cookie.name.trim() === "") {
      errors.push(`rules[${ruleIndex}].cookies[${cookieIndex}].name must be a non-empty string`);
      return;
    }
    if (typeof cookie.value !== "string") {
      errors.push(`rules[${ruleIndex}].cookies[${cookieIndex}].value must be a string`);
      return;
    }

    cookies.push({
      name: cookie.name,
      value: cookie.value,
      ...(typeof cookie.domain === "string" ? { domain: cookie.domain } : {}),
      ...(typeof cookie.path === "string" ? { path: cookie.path } : {}),
      ...(typeof cookie.secure === "boolean" ? { secure: cookie.secure } : {}),
      ...(typeof cookie.hostOnly === "boolean" ? { hostOnly: cookie.hostOnly } : {}),
      ...(typeof cookie.storeId === "string" ? { storeId: cookie.storeId } : {}),
      ...(typeof cookie.expirationDate === "number" ? { expirationDate: cookie.expirationDate } : {}),
    });
  });

  return cookies;
}

function maskSecretString(value: string): string {
  if (value.includes("=") && value.includes(";")) {
    return value.replace(/=([^;]*)/g, "=<redacted>");
  }
  return value;
}
