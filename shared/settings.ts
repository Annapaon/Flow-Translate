import { storage } from "wxt/utils/storage";
import { DEFAULT_SETTINGS, type TranslatorSettings } from "./types";

const settingsItem = storage.defineItem<TranslatorSettings>("local:translatorSettings", {
  defaultValue: DEFAULT_SETTINGS
});

export async function getSettings(): Promise<TranslatorSettings> {
  return { ...DEFAULT_SETTINGS, ...(await settingsItem.getValue()) };
}

export async function saveSettings(settings: TranslatorSettings): Promise<void> {
  await settingsItem.setValue(settings);
}

export function watchSettings(callback: (value: TranslatorSettings) => void): () => void {
  return settingsItem.watch((value) => callback({ ...DEFAULT_SETTINGS, ...value }));
}
