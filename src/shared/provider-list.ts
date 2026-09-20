import type { ProviderType } from "./types";

/** Machine-translation services (no model name, no streaming). Single source of
 *  truth — import this instead of hardcoding the provider list. */
export const MACHINE_PROVIDERS: readonly ProviderType[] = ["baidu", "microsoft", "google"];
export const isMachine = (provider: ProviderType) => MACHINE_PROVIDERS.includes(provider);
