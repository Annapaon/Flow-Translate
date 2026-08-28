import { storage } from "wxt/utils/storage";
import { DEFAULT_SETTINGS, type ModelProfile, type TranslatorSettings } from "./types";

const settingsItem = storage.defineItem<TranslatorSettings>("local:translatorSettings", {
  defaultValue: DEFAULT_SETTINGS
});

export async function getSettings(): Promise<TranslatorSettings> {
  const stored = await settingsItem.getValue();
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  if (!("modelProfiles" in stored)) merged.modelProfiles = [];
  return normalizeSettings(merged);
}

export async function saveSettings(settings: TranslatorSettings): Promise<void> {
  await settingsItem.setValue(normalizeSettings(settings));
}

export function watchSettings(callback: (value: TranslatorSettings) => void): () => void {
  return settingsItem.watch((value) => {
    const merged = { ...DEFAULT_SETTINGS, ...value };
    if (!("modelProfiles" in value)) merged.modelProfiles = [];
    callback(normalizeSettings(merged));
  });
}

export function createModelProfile(seed?: Partial<ModelProfile>): ModelProfile {
  return {
    id: seed?.id ?? crypto.randomUUID(),
    enabled: seed?.enabled ?? true,
    name: seed?.name ?? "新模型",
    apiBaseUrl: seed?.apiBaseUrl ?? "https://api.openai.com/v1",
    apiKey: seed?.apiKey ?? "",
    model: seed?.model ?? "",
    temperature: seed?.temperature ?? 0.2,
    timeoutMs: seed?.timeoutMs ?? 60_000
  };
}

function normalizeSettings(settings: TranslatorSettings): TranslatorSettings {
  let profiles = settings.modelProfiles?.filter(Boolean) ?? [];
  if (profiles.length === 0) {
    profiles = [createModelProfile({
      id: "migrated-model",
      name: settings.model || "默认模型",
      apiBaseUrl: settings.apiBaseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      temperature: settings.temperature,
      timeoutMs: settings.timeoutMs
    })];
  }
  profiles = profiles.map((profile) => ({ ...profile, enabled: profile.enabled ?? true }));
  if (!profiles.some((profile) => profile.enabled)) profiles[0] = { ...profiles[0]!, enabled: true };
  const active = profiles.find((profile) => profile.id === settings.activeModelId && profile.enabled)
    ?? profiles.find((profile) => profile.enabled)
    ?? profiles[0]!;
  return {
    ...settings,
    modelProfiles: profiles,
    activeModelId: active.id,
    apiBaseUrl: active.apiBaseUrl,
    apiKey: active.apiKey,
    model: active.model,
    temperature: active.temperature,
    timeoutMs: active.timeoutMs
  };
}
