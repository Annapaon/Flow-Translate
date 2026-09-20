import { detect, hasTranslatableText, languageCode } from "./language";
import type { PublicTranslatorSettings } from "../../shared/types";

export async function isTargetLanguagePage(
  texts: string[],
  settings: PublicTranslatorSettings
): Promise<boolean> {
  // A pair chooses the opposite language; never skip based on the global target.
  if (settings.bidirectional) return false;
  const samples = texts
    .filter(hasTranslatableText)
    .slice(0, 12)
    .map((text) => text.slice(0, 1000));
  if (samples.join("").trim().length < 120) return false;
  for (const text of samples) {
    // Do not use html[lang] as proof that the actual body matches it.
    const detected = await detect(text);
    if (
      detected.uncertain ||
      languageCode(detected.language) !== languageCode(settings.targetLanguage)
    )
      return false;
  }
  return samples.length > 0;
}
