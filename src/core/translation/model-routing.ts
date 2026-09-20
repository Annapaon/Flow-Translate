import type { FeatureTranslationPreferences, TranslationFeature, TranslatorSettings } from "../../shared/types";

/** Resolve a model once per translation; all provider parameters travel together. */
export function settingsForFeature(settings: TranslatorSettings, feature: TranslationFeature, override?: string): TranslatorSettings {
  const preferences = settings.featurePreferences?.[feature];
  const effective = preferences ? { ...settings, ...preferences } : settings;
  const id = override || effective.featureModels?.[feature] || effective.activeModelId;
  const profile = effective.modelProfiles.find(p => p.id === id && p.enabled)
    ?? (!override ? effective.modelProfiles.find(p => p.enabled) : undefined);
  if (!profile) throw new Error("翻译服务不可用 / Service unavailable");
  // Always hydrate request settings from the selected profile. The top-level
  // provider fields only exist for old exports and may briefly be stale after
  // an import, default-model change, or session-key restoration.
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

/** A feature-page choice updates only that feature; an empty id follows the default. */
export function serviceSelectionPatch(settings: TranslatorSettings, feature: TranslationFeature, id: string): Partial<TranslatorSettings> {
  if (id && !settings.modelProfiles.some(profile => profile.id === id && profile.enabled)) throw new Error("翻译服务不可用 / Service unavailable");
  return { featureModels: { ...settings.featureModels, [feature]: id } };
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
