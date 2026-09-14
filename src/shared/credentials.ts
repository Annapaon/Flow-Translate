import { storage } from "wxt/utils/storage";
import type { TranslatorSettings } from "./types";

/**
 * API keys in "session" mode live in chrome.storage.session: readable only by
 * trusted extension contexts and wiped automatically when the browser closes
 * (plan §9.1). In "local" mode keys stay inline in the persisted settings
 * blob and this store is kept empty.
 */
const sessionKeysItem = storage.defineItem<Record<string, string>>("session:profileApiKeys", {
  defaultValue: {}
});

export function getSessionKeys(): Promise<Record<string, string>> {
  return sessionKeysItem.getValue();
}

export function saveSessionKeys(keys: Record<string, string>): Promise<void> {
  return sessionKeysItem.setValue(keys);
}

export function clearSessionKeys(): Promise<void> {
  return sessionKeysItem.setValue({});
}

/**
 * Removes every API key from a settings object about to be persisted to
 * chrome.storage.local, returning the sanitized settings plus the keys keyed
 * by profile id for the session store.
 */
export function splitSessionKeys(settings: TranslatorSettings): { persisted: TranslatorSettings; keys: Record<string, string> } {
  const keys: Record<string, string> = {};
  for (const profile of settings.modelProfiles) {
    if (profile.apiKey) keys[profile.id] = profile.apiKey;
  }
  return {
    persisted: {
      ...settings,
      apiKey: "",
      modelProfiles: settings.modelProfiles.map((profile) => ({ ...profile, apiKey: "" }))
    },
    keys
  };
}

/**
 * Merges session-stored keys back into a settings object loaded from
 * persistent storage, re-syncing the top-level apiKey from the active profile
 * the same way normalizeSettings does.
 */
export function mergeSessionKeys(settings: TranslatorSettings, keys: Record<string, string>): TranslatorSettings {
  const modelProfiles = settings.modelProfiles.map((profile) => {
    const sessionKey = keys[profile.id];
    return sessionKey ? { ...profile, apiKey: sessionKey } : profile;
  });
  const active = modelProfiles.find((profile) => profile.id === settings.activeModelId);
  return { ...settings, modelProfiles, apiKey: active?.apiKey ?? "" };
}
