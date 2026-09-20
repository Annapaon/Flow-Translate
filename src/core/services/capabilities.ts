import { settingsForFeature } from "../translation/model-routing";
import { isMachine } from "../../shared/provider-list";
import type { TranslationFeature, TranslatorSettings, ProviderType } from "../../shared/types";
export { isMachine };
export const supportsHtml = (provider: ProviderType) => provider !== "baidu";
export function capabilities(provider: ProviderType) {
  return {
    streaming: !isMachine(provider),
    richOutput: !isMachine(provider),
    html: supportsHtml(provider),
    batch: ["microsoft", "google"].includes(provider),
    terms: !isMachine(provider),
  };
}

/** Match the effective enabled profile, including default fallbacks and unsaved UI switches. */
export function capabilitiesForFeature(settings: TranslatorSettings, feature: TranslationFeature) {
  const effective = settingsForFeature(settings, feature);
  const profile = effective.modelProfiles.find(p => p.id === effective.activeModelId && p.enabled);
  return capabilities(profile?.provider ?? effective.provider);
}
