import { mutateSettings } from "./settings";
import { featurePreferencesPatch, serviceSelectionPatch } from "../core/translation/model-routing";
import type { FeatureTranslationPreferences, TranslationFeature, TranslatorSettings } from "./types";

export function selectFeatureService(feature: TranslationFeature, id: string): Promise<TranslatorSettings> {
  return mutateSettings(current => ({ ...current, ...serviceSelectionPatch(current, feature, id) }));
}

export function updateFeaturePreferences(feature: TranslationFeature, patch: Partial<FeatureTranslationPreferences>): Promise<TranslatorSettings> {
  return mutateSettings(current => ({ ...current, ...featurePreferencesPatch(current, feature, patch) }));
}
