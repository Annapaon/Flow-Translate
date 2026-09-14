import type { ProviderType } from "../../shared/types";
export const isMachine = (provider: ProviderType) =>
  ["baidu", "microsoft", "google", "deepl"].includes(provider);
export const supportsHtml = (provider: ProviderType) => provider !== "baidu";
export function capabilities(provider: ProviderType) {
  return {
    streaming: !isMachine(provider),
    richOutput: !isMachine(provider),
    html: supportsHtml(provider),
    batch: ["microsoft", "google", "deepl"].includes(provider),
    terms: !isMachine(provider),
  };
}
