import type { TranslationFeature, TranslatorSettings } from "../../shared/types";

/** Resolve a model once per translation; all provider parameters travel together. */
export function settingsForFeature(settings: TranslatorSettings, feature: TranslationFeature, override?: string): TranslatorSettings {
  const id = override || (settings.separateModels ? settings.featureModels?.[feature] : "");
  const profile = settings.modelProfiles.find(p => p.id === id && p.enabled);
  if (override && !profile) throw new Error("翻译服务不可用 / Service unavailable");
  if (!profile) return settings;
  return { ...settings, activeModelId: profile.id, provider: profile.provider,
    apiBaseUrl: profile.apiBaseUrl, apiKey: profile.apiKey, model: profile.model,
    temperature: profile.temperature, timeoutMs: profile.timeoutMs,
    maxOutputTokens: profile.maxOutputTokens, customHeaders: profile.customHeaders };
}

/** Routing changes apply to the next job; an existing page keeps its snapshot. */
export function pageSettingsFingerprint(settings: TranslatorSettings): string {
  const { separateModels, featureModels, translationStyle, siteRules, ...rest } = settings;
  return JSON.stringify(rest);
}

/** A feature-page choice updates its binding, or the shared default in unified mode. */
export function serviceSelectionPatch(settings: TranslatorSettings, feature: TranslationFeature, id: string): Partial<TranslatorSettings> {
  if (id && !settings.modelProfiles.some(profile => profile.id === id && profile.enabled)) throw new Error("翻译服务不可用 / Service unavailable");
  return settings.separateModels ? { featureModels: { ...settings.featureModels, [feature]: id } } : { activeModelId: id || settings.activeModelId };
}
