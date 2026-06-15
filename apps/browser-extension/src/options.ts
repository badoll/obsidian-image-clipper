import { DEFAULT_SETTINGS, ExtensionSettings, SyncState } from "./constants";
import { getCurrentTabDomain } from "./currentTab";
import { normalizeSettings } from "./cookieSync";
import { getDomainsPermissionStatuses, requestDomainsPermission } from "./permissions";
import {
  NativeMetadataUiState,
  UserConfigUiState,
  describeUserConfigStatus,
  renderHealth,
  renderPermission,
  renderStatus,
  requestState,
} from "./ui";
import { validateExactDomain } from "../../../packages/shared/src/index";

document.addEventListener("DOMContentLoaded", async () => {
  const enabled = document.querySelector<HTMLInputElement>("[name=enabled]");
  const domainInput = document.querySelector<HTMLInputElement>("[name=domain]");
  const refreshInterval = document.querySelector<HTMLInputElement>("[name=refreshIntervalMinutes]");
  const saveButton = document.querySelector<HTMLButtonElement>("[data-save]");
  const addDomainButton = document.querySelector<HTMLButtonElement>("[data-add-domain]");
  const refreshButton = document.querySelector<HTMLButtonElement>("[data-refresh]");
  const loadConfigButton = document.querySelector<HTMLButtonElement>("[data-load-config]");
  const permissionButton = document.querySelector<HTMLButtonElement>("[data-request-permission]");
  const domainError = document.querySelector<HTMLElement>("[data-domain-error]");
  const domainList = document.querySelector<HTMLElement>("[data-domain-list]");
  const currentDomain = document.querySelector<HTMLElement>("[data-current-domain]");
  const metadataButton = document.querySelector<HTMLButtonElement>("[data-metadata]");
  const metadataOutput = document.querySelector<HTMLPreElement>("[data-metadata-output]");
  const configPath = document.querySelector<HTMLElement>("[data-config-path]");
  const configStatus = document.querySelector<HTMLElement>("[data-config-status]");

  let domains: string[] = [...DEFAULT_SETTINGS.domains];
  let currentSyncState: SyncState = {};

  async function hydrate(): Promise<void> {
    const { settings, syncState, userConfig } = await requestState();
    const nativeMetadata = await readNativeMetadataState();
    domains = [...settings.domains];
    currentSyncState = syncState;
    if (enabled) enabled.checked = settings.enabled;
    if (refreshInterval) refreshInterval.value = String(settings.refreshIntervalMinutes);
    renderStatus(document.body, settings, syncState);
    renderUserConfig(userConfig);
    await renderHealth(document.body, settings, syncState, userConfig, nativeMetadata);
    await renderPermission(document.body, domains);
    await renderDomainList();
  }

  async function prefillCurrentDomain(): Promise<void> {
    const tab = await getCurrentTabDomain();
    if (currentDomain) {
      currentDomain.textContent = tab.domain ? `Current page: ${tab.domain}` : "Current page: not available";
      currentDomain.dataset.tone = tab.domain ? "good" : "idle";
    }

    if (!domainInput || !tab.domain || domains.includes(tab.domain) || domainInput.value.trim()) return;
    domainInput.value = tab.domain;
  }

  addDomainButton?.addEventListener("click", async () => {
    addPendingDomain();
    await renderDomainList();
  });

  saveButton?.addEventListener("click", async () => {
    clearDomainError();

    const nextDomains = pendingDomainMerged();
    const validation = validateDomains(nextDomains);
    if (!validation.ok) {
      setDomainError(validation.errors.join("; "));
      await renderPermission(document.body, nextDomains);
      return;
    }

    const rawInterval = Number(refreshInterval?.value ?? DEFAULT_SETTINGS.refreshIntervalMinutes);
    const nextSettings: ExtensionSettings = normalizeSettings({
      enabled: enabled?.checked ?? true,
      domains: validation.value,
      refreshIntervalMinutes: rawInterval,
    });

    const permission = await requestDomainsPermission(nextSettings.domains);
    if (!permission.granted || permission.errors.length > 0) {
      setDomainError(permission.errors.join("; "), permission.granted ? "idle" : "bad");
    }

    const response = await chrome.runtime.sendMessage({ type: "saveSettings", settings: nextSettings });
    const configWriteError =
      response.userConfig && "error" in response.userConfig ? (response.userConfig as UserConfigUiState) : undefined;
    renderUserConfig(response.userConfig);
    if (domainInput) domainInput.value = "";
    await hydrate();
    if (configWriteError) {
      renderUserConfig(configWriteError);
    }
    await prefillCurrentDomain();
  });

  loadConfigButton?.addEventListener("click", async () => {
    const originalText = loadConfigButton.textContent ?? "Reload config.json";
    loadConfigButton.disabled = true;
    loadConfigButton.textContent = "Loading";
    setConfigStatus("Loading centralized config", "idle");

    try {
      const response = await chrome.runtime.sendMessage({ type: "loadUserConfig" });
      if (response?.error) {
        renderUserConfig({ error: response.error });
        return;
      }
      if (!response?.userConfig) {
        renderUserConfig({ error: "No response from the extension background worker" });
        return;
      }
      if (response.settings) {
        const settings = normalizeSettings(response.settings);
        domains = [...settings.domains];
        if (enabled) enabled.checked = settings.enabled;
        if (refreshInterval) refreshInterval.value = String(settings.refreshIntervalMinutes);
      }
      renderUserConfig(response.userConfig);
      if (response.settings) {
        const settings = normalizeSettings(response.settings);
        currentSyncState = response.syncState ?? {};
        renderStatus(document.body, settings, currentSyncState);
      }
      await renderPermission(document.body, domains);
      await renderDomainList();
      await prefillCurrentDomain();
    } catch (error) {
      renderUserConfig({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      loadConfigButton.disabled = false;
      loadConfigButton.textContent = originalText;
    }
  });

  permissionButton?.addEventListener("click", async () => {
    clearDomainError();

    const validation = validateDomains(pendingDomainMerged());
    if (!validation.ok) {
      setDomainError(validation.errors.join("; "));
      await renderPermission(document.body, pendingDomainMerged());
      return;
    }

    const permission = await requestDomainsPermission(validation.value);
    setDomainError(permission.errors.join("; "), permission.granted ? "idle" : "bad");
    await renderPermission(document.body, validation.value);
    await renderDomainList();
  });

  refreshButton?.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "syncNow" });
    await hydrate();
    await prefillCurrentDomain();
  });

  metadataButton?.addEventListener("click", async () => {
    const response = await readNativeMetadataState();
    if (metadataOutput) {
      metadataOutput.textContent = JSON.stringify(response, null, 2);
    }
  });

  await hydrate();
  await prefillCurrentDomain();

  function addPendingDomain(): void {
    const rawValue = domainInput?.value ?? "";
    const validation = validateExactDomain(rawValue);
    if (!validation.ok) {
      setDomainError(validation.errors.join("; "));
      return;
    }

    clearDomainError();
    if (!domains.includes(validation.value)) {
      domains = [...domains, validation.value];
    }
    if (domainInput) domainInput.value = "";
  }

  function pendingDomainMerged(): string[] {
    const pendingValue = domainInput?.value.trim() ?? "";
    if (!pendingValue) return domains;

    const validation = validateExactDomain(pendingValue);
    if (!validation.ok) return [...domains, pendingValue];
    return domains.includes(validation.value) ? domains : [...domains, validation.value];
  }

  function validateDomains(domainValues: string[]): { ok: true; value: string[] } | { ok: false; errors: string[] } {
    const errors: string[] = [];
    const normalized: string[] = [];
    const seen = new Set<string>();

    domainValues.forEach((domain, index) => {
      const validation = validateExactDomain(domain);
      if (!validation.ok) {
        errors.push(...validation.errors.map((error) => `domains[${index}] ${error}`));
        return;
      }
      if (seen.has(validation.value)) return;
      seen.add(validation.value);
      normalized.push(validation.value);
    });

    return errors.length > 0 ? { ok: false, errors } : { ok: true, value: normalized };
  }

  async function renderDomainList(): Promise<void> {
    if (!domainList) return;

    domainList.textContent = "";
    const permissionStatuses = await getDomainsPermissionStatuses(domains).catch(() => []);
    const permissionByDomain = new Map(permissionStatuses.map((status) => [status.domain, status]));
    const syncByDomain = new Map((currentSyncState.domains ?? []).map((status) => [status.domain, status]));

    domains.forEach((domain) => {
      const row = document.createElement("div");
      row.className = "domain-row";

      const name = document.createElement("span");
      name.className = "domain-name";
      name.textContent = domain;

      const details = document.createElement("span");
      details.className = "domain-detail";
      const permission = permissionByDomain.get(domain);
      const sync = syncByDomain.get(domain);
      const permissionText = permission?.hasPermission ? "permission ready" : "permission missing";
      const syncText = sync?.error ? sync.error : sync?.cookieCount !== undefined ? `${sync.cookieCount} cookies` : "not synced";
      details.textContent = `${permissionText}; ${syncText}`;
      details.dataset.tone = sync?.error || permission?.hasPermission === false ? "bad" : permission?.hasPermission ? "good" : "idle";

      const remove = document.createElement("button");
      remove.className = "icon-button";
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", async () => {
        domains = domains.filter((item) => item !== domain);
        await renderDomainList();
        await renderPermission(document.body, domains);
      });

      row.append(name, details, remove);
      domainList.append(row);
    });

    if (domains.length === 0) {
      const empty = document.createElement("p");
      empty.className = "message compact";
      empty.dataset.tone = "idle";
      empty.textContent = "No protected domains yet. Open a protected page or type a host to add one.";
      domainList.append(empty);
    }
  }

  function renderUserConfig(userConfig: UserConfigUiState | undefined): void {
    if (!configPath || !configStatus) return;
    const view = describeUserConfigStatus(userConfig);
    configPath.textContent = view.path;
    configStatus.textContent = view.status;
    configStatus.dataset.tone = view.tone;
  }

  async function readNativeMetadataState(): Promise<NativeMetadataUiState> {
    const response = await chrome.runtime.sendMessage({ type: "readNativeMetadata" });
    if (response?.error) return { error: response.error };
    return response.metadata ?? { error: "Native host metadata read failed" };
  }

  function setConfigStatus(message: string, tone: "good" | "bad" | "idle"): void {
    if (!configStatus) return;
    configStatus.textContent = message;
    configStatus.dataset.tone = tone;
  }

  function clearDomainError(): void {
    if (!domainError) return;
    domainError.textContent = "";
    domainError.dataset.tone = "idle";
  }

  function setDomainError(message: string, tone: "good" | "bad" | "idle" = "bad"): void {
    if (!domainError) return;
    domainError.textContent = message;
    domainError.dataset.tone = tone;
  }
});
