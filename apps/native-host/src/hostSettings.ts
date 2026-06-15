import fs from "node:fs/promises";
import { HOST_SETTINGS_PATH } from "./paths";

export type HostSettings = {
  allowedOrigins: string[];
};

export async function readHostSettings(): Promise<HostSettings | null> {
  const envOrigins = process.env.OIC_ALLOWED_ORIGINS;
  if (envOrigins) {
    return {
      allowedOrigins: envOrigins.split(",").map((origin) => origin.trim()).filter(Boolean),
    };
  }

  try {
    const raw = await fs.readFile(HOST_SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw) as HostSettings;
    if (!Array.isArray(parsed.allowedOrigins)) return null;
    return {
      allowedOrigins: parsed.allowedOrigins.filter((origin) => typeof origin === "string"),
    };
  } catch {
    return null;
  }
}

export async function isOriginAllowed(origin: string | undefined): Promise<boolean> {
  if (!origin) return false;

  const settings = await readHostSettings();
  if (!settings) return false;

  return settings.allowedOrigins.includes(origin);
}
