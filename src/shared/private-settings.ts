import { SETTINGS_STORE, withStore } from "./db";
import { DEFAULT_SETTINGS, type TranslatorSettings } from "./types";

const REVISION_KEY = "privateSettingsRevision";

/** Firefox content scripts use the website's IDB origin, not this store. */
export async function getPrivateSettings(): Promise<TranslatorSettings> {
  return (
    (await withStore<TranslatorSettings>(SETTINGS_STORE, "readonly", (store) =>
      store.get("settings")
    )) ?? structuredClone(DEFAULT_SETTINGS)
  );
}

export async function setPrivateSettings(
  value: TranslatorSettings
): Promise<void> {
  await withStore(SETTINGS_STORE, "readwrite", (store) =>
    store.put(value, "settings")
  );
  // Notify other extension contexts only after committing. No secrets are sent.
  await browser.storage.local.set({ [REVISION_KEY]: crypto.randomUUID() });
}

export function watchPrivateSettings(callback: () => void): () => void {
  const listener = (changes: Record<string, unknown>, area: string) => {
    if (area === "local" && REVISION_KEY in changes) callback();
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
