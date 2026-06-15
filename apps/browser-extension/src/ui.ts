import { DEFAULT_SETTINGS, DomainSyncState, ExtensionSettings, SyncState } from "./constants";
import { normalizeSettings } from "./cookieSync";
import { DomainPermissionStatus, getDomainsPermissionStatuses } from "./permissions";
import { DEFAULT_USER_CONFIG_PATH, UserConfig, validateExactDomain } from "../../../packages/shared/src/index";

export function formatDate(value: string | undefined): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

export function renderStatus(root: HTMLElement, settings: ExtensionSettings, syncState: SyncState): void {
  const status = root.querySelector<HTMLElement>("[data-status]");
  const domain = root.querySelector<HTMLElement>("[data-domain]");
  const updated = root.querySelector<HTMLElement>("[data-updated]");
  const count = root.querySelector<HTMLElement>("[data-count]");
  const error = root.querySelector<HTMLElement>("[data-error]");
  const permission = root.querySelector<HTMLElement>("[data-permission]");
  const domainStates = getVisibleDomainStates(settings, syncState);
  const visibleError = getVisibleSyncError(settings, syncState);

  if (status) {
    status.textContent = settings.enabled && settings.domains.length === 0 ? "Setup needed" : settings.enabled ? "Enabled" : "Paused";
    status.dataset.tone = visibleError ? "bad" : settings.enabled && settings.domains.length > 0 ? "good" : "idle";
  }
  if (domain) domain.textContent = formatDomainsSummary(settings.domains);
  if (updated) updated.textContent = formatDate(syncState.lastSyncAt);
  if (count) count.textContent = String(syncState.lastCookieCount ?? 0);
  if (error) {
    error.textContent = visibleError ?? "No errors reported.";
    error.dataset.tone = visibleError ? "bad" : "idle";
  }
  if (permission) {
    if (settings.domains.length === 0) {
      permission.textContent = "Add a protected domain first";
      permission.dataset.tone = "idle";
      return;
    }

    const missingDomains = domainStates.filter((state) => state.permissionMissing);
    const checkedDomains = new Set(domainStates.map((state) => state.domain));
    const uncheckedDomains = settings.domains.filter((configuredDomain) => !checkedDomains.has(configuredDomain));

    if ((syncState.domains ?? []).length > 0) {
      permission.textContent =
        missingDomains.length > 0
          ? `Missing ${missingDomains.map((state) => state.domain).join(", ")}`
          : uncheckedDomains.length > 0
            ? `Not checked for ${uncheckedDomains.join(", ")}`
          : `Permission ready for ${formatDomainsSummary(settings.domains)}`;
      permission.dataset.tone = missingDomains.length > 0 ? "bad" : uncheckedDomains.length > 0 ? "idle" : "good";
    } else if (syncState.permissionMissing === undefined) {
      permission.textContent = "Not checked";
      permission.dataset.tone = "idle";
    } else {
      permission.textContent = syncState.permissionMissing
        ? `Missing ${syncState.permissionOrigin ?? "host permission"}`
        : "Permission ready";
      permission.dataset.tone = syncState.permissionMissing ? "bad" : "good";
    }
  }
}

export function getVisibleDomainStates(settings: ExtensionSettings, syncState: SyncState): DomainSyncState[] {
  if (settings.domains.length === 0) return [];

  const configuredDomains = new Set(settings.domains);
  return (syncState.domains ?? []).filter((state) => configuredDomains.has(state.domain));
}

export function getVisibleSyncError(settings: ExtensionSettings, syncState: SyncState): string | undefined {
  if (settings.domains.length === 0) return undefined;

  const domainStates = syncState.domains;
  if (domainStates && domainStates.length > 0) {
    const visibleDomainStates = getVisibleDomainStates(settings, syncState);
    const visibleDomainError = summarizeDomainErrors(visibleDomainStates);
    if (visibleDomainError) return visibleDomainError;

    const configuredDomains = new Set(settings.domains);
    const hiddenFailures = domainStates.filter((state) => !configuredDomains.has(state.domain) && state.error);
    const allFailures = domainStates.filter((state) => state.error);
    const onlyHiddenFailures = hiddenFailures.length > 0 && hiddenFailures.length === allFailures.length;
    const rawDomainError = summarizeDomainErrors(domainStates);
    if (
      onlyHiddenFailures &&
      hiddenFailures.every((state) => syncState.lastError?.includes(`${state.domain}:`))
    ) {
      return undefined;
    }

    return syncState.lastError && syncState.lastError !== rawDomainError ? syncState.lastError : undefined;
  }

  return syncState.lastError;
}

export async function renderPermission(root: HTMLElement, domainValues: string[] | string): Promise<void> {
  const permission = root.querySelector<HTMLElement>("[data-permission]");
  if (!permission) return;

  const domains = Array.isArray(domainValues) ? domainValues : [domainValues];
  if (domains.length === 0) {
    permission.textContent = "Add a protected domain first";
    permission.dataset.tone = "idle";
    return;
  }

  const validationErrors = domains.flatMap((domain, index) => {
    const validation = validateExactDomain(domain);
    return validation.ok ? [] : validation.errors.map((error) => `domains[${index}] ${error}`);
  });

  if (validationErrors.length > 0) {
    permission.textContent = validationErrors.join("; ");
    permission.dataset.tone = "bad";
    return;
  }

  const statuses = await getDomainsPermissionStatuses(domains);
  const missing = statuses.filter((status) => !status.hasPermission);

  if (missing.length === 0) {
    permission.textContent = `Permission granted for ${formatDomainsSummary(domains)}`;
    permission.dataset.tone = "good";
    return;
  }

  permission.textContent = `Permission missing for ${missing.map((status) => status.domain ?? status.origin).join(", ")}`;
  permission.dataset.tone = "bad";
}

export type UserConfigUiState =
  | { path: string; exists: boolean; config: UserConfig; errors: string[] }
  | { error: string };

export type UserConfigStatusView = {
  path: string;
  status: string;
  tone: "good" | "bad" | "idle";
};

export type NativeMetadataUiState = {
  exists?: boolean;
  rules?: Array<{ domain?: string }>;
  error?: string;
};

export type HealthItem = {
  label: string;
  status: string;
  tone: "good" | "bad" | "idle";
};

export async function requestState(): Promise<{
  settings: ExtensionSettings;
  syncState: SyncState;
  userConfig?: UserConfigUiState;
  error?: string;
}> {
  const response = await chrome.runtime.sendMessage({ type: "getState" });
  return {
    settings: normalizeSettings(response.settings ?? DEFAULT_SETTINGS),
    syncState: response.syncState ?? {},
    userConfig: response.userConfig,
    error: response.error,
  };
}

export function formatDomainsSummary(domains: string[]): string {
  if (domains.length === 0) return "No domains";
  if (domains.length === 1) return domains[0];
  return `${domains.length} domains`;
}

function summarizeDomainErrors(states: DomainSyncState[]): string | undefined {
  const failures = states.filter((state) => state.error);
  if (failures.length === 0) return undefined;

  const prefix = failures.length === states.length ? "No domains synced" : "Some domains did not sync";
  return `${prefix}: ${failures.map((state) => `${state.domain}: ${state.error}`).join("; ")}`;
}

export function describeUserConfigStatus(userConfig: UserConfigUiState | undefined): UserConfigStatusView {
  if (!userConfig) {
    return {
      path: DEFAULT_USER_CONFIG_PATH,
      status: "Not checked",
      tone: "idle",
    };
  }

  if ("error" in userConfig) {
    return {
      path: DEFAULT_USER_CONFIG_PATH,
      status: userConfig.error,
      tone: "bad",
    };
  }

  if (!userConfig.exists) {
    return {
      path: userConfig.path,
      status: "Missing; install the native host or save settings to create it",
      tone: "idle",
    };
  }

  if (userConfig.errors.length > 0) {
    return {
      path: userConfig.path,
      status: userConfig.errors.join("; "),
      tone: "bad",
    };
  }

  return {
    path: userConfig.path,
    status: "Loaded",
    tone: "good",
  };
}

export async function renderHealth(
  root: HTMLElement,
  settings: ExtensionSettings,
  syncState: SyncState,
  userConfig: UserConfigUiState | undefined,
  nativeMetadata: NativeMetadataUiState | undefined,
): Promise<void> {
  const healthList = root.querySelector<HTMLElement>("[data-health-list]");
  if (!healthList) return;

  const permissionStatuses = await getDomainsPermissionStatuses(settings.domains).catch(() => []);
  const items = buildHealthItems(settings, syncState, userConfig, permissionStatuses, nativeMetadata);

  healthList.textContent = "";
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "health-row";
    row.dataset.tone = item.tone;

    const label = document.createElement("span");
    label.textContent = item.label;

    const status = document.createElement("strong");
    status.textContent = item.status;

    row.append(label, status);
    healthList.append(row);
  });
}

export function buildHealthItems(
  settings: ExtensionSettings,
  syncState: SyncState,
  userConfig: UserConfigUiState | undefined,
  permissionStatuses: DomainPermissionStatus[],
  nativeMetadata: NativeMetadataUiState | undefined,
): HealthItem[] {
  const configuredDomains = new Set(settings.domains);
  const visibleDomainStates = getVisibleDomainStates(settings, syncState);
  const syncedDomains = visibleDomainStates.filter((state) => !state.error && (state.cookieCount ?? 0) > 0);
  const visibleSyncError = getVisibleSyncError(settings, syncState);
  const missingPermissions = permissionStatuses.filter((status) => !status.hasPermission);

  return [
    {
      label: "Browser extension",
      status: "Loaded",
      tone: "good",
    },
    describeNativeHostHealth(userConfig),
    describeConfigHealth(userConfig),
    {
      label: "Domains configured",
      status: settings.domains.length === 0 ? "None" : formatDomainsSummary(settings.domains),
      tone: settings.domains.length === 0 ? "idle" : "good",
    },
    {
      label: "Permissions granted",
      status:
        settings.domains.length === 0
          ? "No domains"
          : missingPermissions.length === 0
            ? "Ready"
            : `Missing ${missingPermissions.map((status) => status.domain ?? status.origin).join(", ")}`,
      tone: settings.domains.length === 0 ? "idle" : missingPermissions.length === 0 ? "good" : "bad",
    },
    {
      label: "Cookies synced",
      status:
        settings.domains.length === 0
          ? "No domains"
          : visibleSyncError
            ? visibleSyncError
            : syncedDomains.length > 0
              ? `${syncedDomains.length}/${settings.domains.length} domains`
              : syncState.lastSyncAt
                ? "No cookies"
                : "Not synced",
      tone:
        settings.domains.length === 0
          ? "idle"
          : visibleSyncError
            ? "bad"
            : syncedDomains.length > 0
              ? "good"
              : "idle",
    },
    describeAuthFileHealth(nativeMetadata, configuredDomains),
  ];
}

function describeNativeHostHealth(userConfig: UserConfigUiState | undefined): HealthItem {
  if (!userConfig) {
    return {
      label: "Native host",
      status: "Checking",
      tone: "idle",
    };
  }

  if ("error" in userConfig) {
    return {
      label: "Native host",
      status: userConfig.error,
      tone: "bad",
    };
  }

  return {
    label: "Native host",
    status: "Connected",
    tone: "good",
  };
}

function describeConfigHealth(userConfig: UserConfigUiState | undefined): HealthItem {
  if (!userConfig) {
    return {
      label: "Config writable",
      status: "Not checked",
      tone: "idle",
    };
  }

  if ("error" in userConfig) {
    return {
      label: "Config writable",
      status: "Not connected",
      tone: "bad",
    };
  }

  if (userConfig.errors.length > 0) {
    return {
      label: "Config writable",
      status: userConfig.errors.join("; "),
      tone: "bad",
    };
  }

  return {
    label: "Config writable",
    status: userConfig.exists ? "Ready" : "Will be created on save",
    tone: userConfig.exists ? "good" : "idle",
  };
}

function describeAuthFileHealth(nativeMetadata: NativeMetadataUiState | undefined, configuredDomains: Set<string>): HealthItem {
  if (!nativeMetadata) {
    return {
      label: "Obsidian auth file",
      status: "Not checked",
      tone: "idle",
    };
  }

  if (nativeMetadata.error) {
    return {
      label: "Obsidian auth file",
      status: nativeMetadata.error,
      tone: "bad",
    };
  }

  if (!nativeMetadata.exists) {
    return {
      label: "Obsidian auth file",
      status: "Missing",
      tone: configuredDomains.size > 0 ? "bad" : "idle",
    };
  }

  const matchingRules = (nativeMetadata.rules ?? []).filter((rule) => rule.domain && configuredDomains.has(rule.domain));
  return {
    label: "Obsidian auth file",
    status: matchingRules.length > 0 ? `${matchingRules.length} matching rules` : "No matching rules",
    tone: matchingRules.length > 0 ? "good" : configuredDomains.size > 0 ? "bad" : "idle",
  };
}
