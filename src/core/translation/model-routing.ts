import type { FeatureTranslationPreferences, TranslationFeature, TranslatorSettings } from "../../shared/types";

/** Resolve a model once per translation; all provider parameters travel together. */
export function settingsForFeature(settings: TranslatorSettings, feature: TranslationFeature, override?: string): TranslatorSettings {
  const preferences = settings.featurePreferences?.[feature];
  const effective = preferences ? { ...settings, ...preferences } : settings;
  const id = override || (effective.separateModels ? effective.featureModels?.[feature] : "");
  const profile = effective.modelProfiles.find(p => p.id === id && p.enabled);
  if (override && !profile) throw new Error("翻译服务不可用 / Service unavailable");
  if (!profile) return effective;
  return { ...effective, activeModelId: profile.id, provider: profile.provider,
    apiBaseUrl: profile.apiBaseUrl, apiKey: profile.apiKey, model: profile.model,
    temperature: profile.temperature, timeoutMs: profile.timeoutMs,
    maxOutputTokens: profile.maxOutputTokens, customHeaders: profile.customHeaders };
}

/** Routing changes apply to the next job; an existing page keeps its snapshot. */
export function pageSettingsFingerprint(settings: TranslatorSettings): string {
  const {
    separateModels, featureModels, featurePreferences, translationStyle, siteRules,
    activeModelId, provider, apiBaseUrl, apiKey, model, temperature, timeoutMs,
    maxOutputTokens, customHeaders, ...rest
  } = settings;
  return JSON.stringify({ ...rest, pagePreferences: featurePreferences?.page });
}

/** A feature-page choice updates its binding, or the shared default in unified mode. */
export function serviceSelectionPatch(settings: TranslatorSettings, feature: TranslationFeature, id: string): Partial<TranslatorSettings> {
  if (id && !settings.modelProfiles.some(profile => profile.id === id && profile.enabled)) throw new Error("翻译服务不可用 / Service unavailable");
  return settings.separateModels ? { featureModels: { ...settings.featureModels, [feature]: id } } : { activeModelId: id || settings.activeModelId };
}

export function featurePreferencesPatch(
  settings: TranslatorSettings,
  feature: TranslationFeature,
  patch: Partial<FeatureTranslationPreferences>
): Partial<TranslatorSettings> {
  const legacy = feature === "selection" ? patch : {};
  return {
    ...legacy,
    featurePreferences: {
      ...settings.featurePreferences,
      [feature]: { ...settings.featurePreferences[feature], ...patch }
    }
  };
}
