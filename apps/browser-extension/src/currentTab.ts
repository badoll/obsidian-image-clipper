import { validateExactDomain } from "../../../packages/shared/src/index";

export type CurrentTabDomain = {
  domain?: string;
  url?: string;
  error?: string;
};

export async function getCurrentTabDomain(): Promise<CurrentTabDomain> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const url = tab?.url;
    if (typeof url !== "string" || url.trim() === "") {
      return { error: "No active tab URL is available" };
    }

    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { url, error: "Current page is not a web URL" };
    }

    const validation = validateExactDomain(parsed.hostname);
    if (!validation.ok) {
      return { url, error: validation.errors.join("; ") };
    }

    return { url, domain: validation.value };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
