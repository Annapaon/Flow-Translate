import { mutateSettings } from "./settings";
import { serviceSelectionPatch } from "../core/translation/model-routing";
import type { TranslationFeature, TranslatorSettings } from "./types";

export function selectFeatureService(feature: TranslationFeature, id: string): Promise<TranslatorSettings> {
  return mutateSettings(current => ({ ...current, ...serviceSelectionPatch(current, feature, id) }));
}
