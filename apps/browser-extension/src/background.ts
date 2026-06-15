import {
  configureAlarm,
  syncCookiesNow,
  getSyncState,
  getSettings,
  saveSettings,
  readNativeMetadata,
  readUserConfig,
  loadSettingsFromUserConfig,
  writeUserConfigFromSettings,
} from "./cookieSync";

chrome.runtime.onInstalled.addListener(async () => {
  await configureAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  await configureAlarm();
});

chrome.alarms.onAlarm.addListener(async (alarm: any) => {
  if (alarm.name === "cookie-refresh") {
    await syncCookiesNow();
  }
});

chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (response: unknown) => void) => {
  (async () => {
    switch (message?.type) {
      case "syncNow":
        sendResponse(await syncCookiesNow());
        break;
      case "getState":
        sendResponse({
          settings: await getSettings(),
          syncState: await getSyncState(),
          userConfig: await readUserConfig().catch((error) => ({
            error: error instanceof Error ? error.message : String(error),
          })),
        });
        break;
      case "saveSettings": {
        const savedSettings = await saveSettings(message.settings);
        const userConfig = await writeUserConfigFromSettings(savedSettings).catch((error) => ({
          error: error instanceof Error ? error.message : String(error),
        }));
        await configureAlarm();
        sendResponse({
          settings: await getSettings(),
          syncState: await getSyncState(),
          userConfig,
        });
        break;
      }
      case "readUserConfig":
        sendResponse({ userConfig: await readUserConfig() });
        break;
      case "loadUserConfig": {
        const loaded = await loadSettingsFromUserConfig();
        await configureAlarm();
        sendResponse({
          settings: loaded.settings,
          syncState: await getSyncState(),
          userConfig: loaded.userConfig,
        });
        break;
      }
      case "readNativeMetadata":
        sendResponse({ metadata: await readNativeMetadata() });
        break;
      default:
        sendResponse({ error: "Unknown message" });
    }
  })().catch((error) => {
    sendResponse({ error: error instanceof Error ? error.message : String(error) });
  });

  return true;
});
