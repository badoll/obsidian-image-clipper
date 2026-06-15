import { DEFAULT_SETTINGS, ExtensionSettings, SyncState } from "./constants";
import { getCurrentTabDomain } from "./currentTab";
import { normalizeSettings } from "./cookieSync";
import { requestDomainsPermission } from "./permissions";
import { renderStatus, requestState } from "./ui";

function updateGrantButton(button: HTMLButtonElement | null, settings: ExtensionSettings, syncState: SyncState): void {
  if (!button) return;

  if (settings.domains.length === 0) {
    button.hidden = true;
    return;
  }

  const configuredDomains = new Set(settings.domains);
  const visibleMissingDomain = (syncState.domains ?? []).some(
    (state) => configuredDomains.has(state.domain) && state.permissionMissing,
  );
  const globalMissingPermission = syncState.domains === undefined && syncState.permissionMissing === true;

  button.hidden = !visibleMissingDomain && !globalMissingPermission;
}

function updateCurrentDomainAction(
  button: HTMLButtonElement | null,
  label: HTMLElement | null,
  currentDomain: string | undefined,
  settings: ExtensionSettings,
): void {
  const canAdd = Boolean(currentDomain && !settings.domains.includes(currentDomain));

  if (button) {
    button.hidden = !canAdd;
    button.textContent = currentDomain ? `Add ${currentDomain}` : "Add current domain";
  }

  if (label) {
    label.textContent = currentDomain
      ? canAdd
        ? `Current page: ${currentDomain}`
        : `Current page already configured: ${currentDomain}`
      : "Current page: not available";
    label.dataset.tone = currentDomain ? "good" : "idle";
  }
}

async function refresh(
  grantButton: HTMLButtonElement | null,
  addCurrentButton: HTMLButtonElement | null,
  currentDomainLabel: HTMLElement | null,
  currentDomain: string | undefined,
): Promise<{
  settings: ExtensionSettings;
  syncState: SyncState;
}> {
  const state = await requestState();
  renderStatus(document.body, state.settings, state.syncState);
  updateGrantButton(grantButton, state.settings, state.syncState);
  updateCurrentDomainAction(addCurrentButton, currentDomainLabel, currentDomain, state.settings);
  return {
    settings: state.settings,
    syncState: state.syncState,
  };
}

document.addEventListener("DOMContentLoaded", async () => {
  const button = document.querySelector<HTMLButtonElement>("[data-refresh]");
  const grantButton = document.querySelector<HTMLButtonElement>("[data-grant-access]");
  const addCurrentButton = document.querySelector<HTMLButtonElement>("[data-add-current-domain]");
  const currentDomainLabel = document.querySelector<HTMLElement>("[data-current-domain]");
  const optionsButton = document.querySelector<HTMLButtonElement>("[data-options]");
  const tabDomain = await getCurrentTabDomain();
  let currentSettings: ExtensionSettings = DEFAULT_SETTINGS;
  let currentSyncState: SyncState = {};

  button?.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Refreshing";
    const syncState = await chrome.runtime.sendMessage({ type: "syncNow" });
    const state = await requestState();
    currentSettings = state.settings;
    currentSyncState = syncState;
    renderStatus(document.body, state.settings, syncState);
    updateGrantButton(grantButton, state.settings, syncState);
    updateCurrentDomainAction(addCurrentButton, currentDomainLabel, tabDomain.domain, currentSettings);
    button.disabled = false;
    button.textContent = "Refresh now";
  });

  grantButton?.addEventListener("click", async () => {
    const originalText = grantButton.textContent ?? "Grant access";
    grantButton.disabled = true;
    grantButton.textContent = "Granting";

    try {
      const permission = await requestDomainsPermission(currentSettings.domains);
      if (!permission.granted) {
        currentSyncState = {
          ...currentSyncState,
          lastError: permission.errors.join("; "),
          permissionMissing: true,
          permissionOrigin: permission.statuses.find((status) => !status.hasPermission)?.origin,
        };
        renderStatus(document.body, currentSettings, currentSyncState);
        updateGrantButton(grantButton, currentSettings, currentSyncState);
        return;
      }

      const syncState = await chrome.runtime.sendMessage({ type: "syncNow" });
      const state = await requestState();
      currentSettings = state.settings;
      currentSyncState = syncState;
      renderStatus(document.body, state.settings, syncState);
      updateGrantButton(grantButton, state.settings, syncState);
    } finally {
      grantButton.disabled = false;
      grantButton.textContent = originalText;
    }
  });

  addCurrentButton?.addEventListener("click", async () => {
    if (!tabDomain.domain) return;

    const originalText = addCurrentButton.textContent ?? "Add current domain";
    addCurrentButton.disabled = true;
    addCurrentButton.textContent = "Adding";

    try {
      const nextSettings = normalizeSettings({
        ...currentSettings,
        domains: [...currentSettings.domains, tabDomain.domain],
      });
      const permission = await requestDomainsPermission(nextSettings.domains);
      const response = await chrome.runtime.sendMessage({ type: "saveSettings", settings: nextSettings });
      const configWriteError =
        response.userConfig && "error" in response.userConfig ? String(response.userConfig.error) : undefined;
      currentSettings = response.settings ?? nextSettings;
      currentSyncState = response.syncState ?? currentSyncState;

      if (!permission.granted) {
        currentSyncState = {
          ...currentSyncState,
          lastError: permission.errors.join("; "),
          permissionMissing: true,
          permissionOrigin: permission.statuses.find((status) => !status.hasPermission)?.origin,
        };
      } else {
        currentSyncState = await chrome.runtime.sendMessage({ type: "syncNow" });
      }

      if (configWriteError) {
        currentSyncState = {
          ...currentSyncState,
          lastError: configWriteError,
        };
      }

      const state = await requestState();
      currentSettings = state.settings;
      renderStatus(document.body, currentSettings, currentSyncState);
      updateGrantButton(grantButton, currentSettings, currentSyncState);
      updateCurrentDomainAction(addCurrentButton, currentDomainLabel, tabDomain.domain, currentSettings);
    } finally {
      addCurrentButton.disabled = false;
      addCurrentButton.textContent = originalText;
    }
  });

  optionsButton?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  const state = await refresh(grantButton, addCurrentButton, currentDomainLabel, tabDomain.domain);
  currentSettings = state.settings;
  currentSyncState = state.syncState;
});
