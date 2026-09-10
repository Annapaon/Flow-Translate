import { storage } from "wxt/utils/storage";
import type { PublicTranslatorSettings } from "./types";
export const pausedSites = storage.defineItem<string[]>("session:pausedSites", {
  defaultValue: [],
});
export const disabledSites = storage.defineItem<string[]>(
  "local:disabledSites",
  { defaultValue: [] },
);
export function matchesSite(host: string, sites: string[]) {
  return sites.some((s) => {
    const domain = s
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^\*\./, "")
      .split("/")[0]
      ?.split(":")[0];
    return domain && (host === domain || host.endsWith(`.${domain}`));
  });
}
export function blockedUrl(url: string, settings: PublicTranslatorSettings) {
  try {
    const host = new URL(url).hostname;
    return settings.siteAccessMode === "whitelist"
      ? !matchesSite(host, settings.allowedSites)
      : matchesSite(host, settings.blockedSites);
  } catch {
    return true;
  }
}
export async function isPaused(url: string) {
  try {
    return [
      ...(await pausedSites.getValue()),
      ...(await disabledSites.getValue()),
    ].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}
