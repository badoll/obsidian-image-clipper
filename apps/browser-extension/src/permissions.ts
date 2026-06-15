import { ValidationResult, validateExactDomain } from "../../../packages/shared/src/index";

export type DomainPermissionStatus = {
  domain?: string;
  origin?: string;
  origins?: string[];
  hasPermission: boolean;
  errors: string[];
};

export type DomainsPermissionStatus = {
  origins: string[];
  statuses: DomainPermissionStatus[];
  granted: boolean;
  errors: string[];
};

export function domainToPermissionOrigin(domain: string): ValidationResult<string> {
  const validation = validateExactDomain(domain);
  if (!validation.ok) return validation;
  return { ok: true, value: `https://${validation.value}/*`, errors: [] };
}

export function domainToCookieUrl(domain: string): ValidationResult<string> {
  const validation = validateExactDomain(domain);
  if (!validation.ok) return validation;
  return { ok: true, value: `https://${validation.value}/`, errors: [] };
}

export function domainToPermissionOrigins(domain: string): ValidationResult<string[]> {
  const origin = domainToPermissionOrigin(domain);
  if (!origin.ok) return origin;

  const origins = [origin.value];
  const parentDomain = parentCookieDomain(domain);
  if (parentDomain && parentDomain !== domain) {
    origins.push(`https://${parentDomain}/*`, `https://*.${parentDomain}/*`);
  }

  return { ok: true, value: Array.from(new Set(origins)), errors: [] };
}

export function domainsToPermissionOrigins(domains: string[]): ValidationResult<string[]> {
  const origins: string[] = [];
  const errors: string[] = [];

  domains.forEach((domain, index) => {
    const result = domainToPermissionOrigins(domain);
    if (!result.ok) {
      errors.push(...result.errors.map((error) => `domains[${index}] ${error}`));
      return;
    }
    origins.push(...result.value);
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: Array.from(new Set(origins)), errors: [] };
}

export async function getDomainPermissionStatus(domain: string): Promise<DomainPermissionStatus> {
  const validation = validateExactDomain(domain);
  if (!validation.ok) {
    return { hasPermission: false, errors: validation.errors };
  }

  const origins = domainToPermissionOrigins(validation.value);
  if (!origins.ok) return { hasPermission: false, errors: origins.errors };

  try {
    const checks = await Promise.all(origins.value.map((origin) => permissionsContains({ origins: [origin] })));
    const missingOrigins = origins.value.filter((_, index) => !checks[index]);
    return {
      domain: validation.value,
      origin: missingOrigins[0] ?? origins.value[0],
      origins: origins.value,
      hasPermission: missingOrigins.length === 0,
      errors: missingOrigins.length > 0 ? [`Missing host permissions: ${missingOrigins.join(", ")}`] : [],
    };
  } catch (error) {
    return {
      origin: origins.value[0],
      origins: origins.value,
      hasPermission: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export async function getDomainsPermissionStatuses(domains: string[]): Promise<DomainPermissionStatus[]> {
  return Promise.all(domains.map((domain) => getDomainPermissionStatus(domain)));
}

export async function requestDomainPermission(domain: string): Promise<DomainPermissionStatus & { granted: boolean }> {
  const validation = validateExactDomain(domain);
  if (!validation.ok) {
    return { hasPermission: false, granted: false, errors: validation.errors };
  }

  const origins = domainToPermissionOrigins(validation.value);
  if (!origins.ok) return { hasPermission: false, granted: false, errors: origins.errors };

  try {
    const granted = await permissionsRequest({ origins: origins.value });
    return {
      domain: validation.value,
      origin: origins.value[0],
      origins: origins.value,
      hasPermission: granted,
      granted,
      errors: granted ? [] : [`Browser permission was not granted for ${origins.value.join(", ")}`],
    };
  } catch (error) {
    return {
      origin: origins.value[0],
      origins: origins.value,
      hasPermission: false,
      granted: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export async function requestDomainsPermission(domains: string[]): Promise<DomainsPermissionStatus> {
  if (domains.length === 0) {
    return {
      origins: [],
      statuses: [],
      granted: true,
      errors: [],
    };
  }

  const origins = domainsToPermissionOrigins(domains);
  if (!origins.ok) {
    return {
      origins: [],
      statuses: [],
      granted: false,
      errors: origins.errors,
    };
  }

  try {
    const granted = await permissionsRequest({ origins: origins.value });
    const statuses = await getDomainsPermissionStatuses(domains);
    const errors = statuses.flatMap((status) => status.errors);
    return {
      origins: origins.value,
      statuses,
      granted,
      errors: granted ? errors : errors.length > 0 ? errors : [`Browser permission was not granted for ${origins.value.join(", ")}`],
    };
  } catch (error) {
    return {
      origins: origins.value,
      statuses: [],
      granted: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

function permissionsContains(request: { origins: string[] }): Promise<boolean> {
  return new Promise((resolve, reject) => {
    chrome.permissions.contains(request, (result: boolean) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(Boolean(result));
    });
  });
}

export function parentCookieDomain(domain: string): string | null {
  const validation = validateExactDomain(domain);
  if (!validation.ok) return null;

  const labels = validation.value.split(".");
  if (labels.length < 3) return validation.value;
  return labels.slice(1).join(".");
}

function permissionsRequest(request: { origins: string[] }): Promise<boolean> {
  return new Promise((resolve, reject) => {
    chrome.permissions.request(request, (granted: boolean) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(Boolean(granted));
    });
  });
}
