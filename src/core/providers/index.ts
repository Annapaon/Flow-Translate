import { diagnose, diagnostic } from "./diagnostics";
import { modelLane, schedule } from "../translation/scheduler";
import { registerMeter } from "../translation/meter";
import { isMachine, machineTranslate } from "../services/machine";
import { providerRequiresApiKey, validateApiUrl } from "../../shared/security";
import type { TestConnectionResponse, TranslatorSettings } from "../../shared/types";
import { buildPrompts } from "./prompts";
import { getProvider } from "./registry";
import type { ProviderConfig, TranslationRequest } from "./types";

export { isRetryableTranslationError } from "./errors";
export { PROVIDER_PRESETS, findProviderPreset, providerDisplayName, getProvider } from "./registry";
export type { ProviderPreset } from "./registry";
export type { ProviderConfig, TestResult, TranslationChunk, TranslationProvider, TranslationRequest } from "./types";

/**
 * Derives the per-request provider configuration from the active settings.
 * The API URL is validated (HTTPS enforced except loopback/LAN), and the
 * Anthropic-style auth mode is read from the active model profile because it
 * is not mirrored onto the top-level settings object.
 */
function toProviderConfig(settings: TranslatorSettings): ProviderConfig {
  const english = settings.uiLanguage === "en";
  const activeProfile = settings.modelProfiles.find((profile) => profile.id === settings.activeModelId);
  return {
    provider: settings.provider,
    apiBaseUrl: validateApiUrl(settings.apiBaseUrl, english),
    apiKey: settings.apiKey,
    model: settings.model,
    temperature: settings.temperature,
    timeoutMs: settings.timeoutMs,
    maxOutputTokens: settings.maxOutputTokens,
    customHeaders: settings.customHeaders ?? {},
    authMode: activeProfile?.authMode ?? (settings.provider === "anthropic" ? "x-api-key" : "bearer"),
    enableThinking: settings.enableThinking,
    english
  };
}

/** Renders the prompts and packages them into a provider-agnostic request. */
function toTranslationRequest(text: string, settings: TranslatorSettings): TranslationRequest {
  const { system, user } = buildPrompts(text, settings);
  return {
    text,
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    systemPrompt: system,
    userPrompt: user
  };
}

/**
 * Throws when the settings cannot possibly produce a request. Kept in sync
 * with the original single-file behavior so error messages (and the tests
 * that assert on them) are unchanged.
 */
function assertTranslatable(settings: TranslatorSettings): void {
  const english = settings.uiLanguage === "en";
  if (providerRequiresApiKey(settings.provider) && !settings.apiKey.trim()) {
    throw new Error(english ? "Enter an API key in extension settings first" : "请先在扩展设置中填写 API Key");
  }
  if (!settings.apiBaseUrl.trim() || !settings.model.trim()) {
    throw new Error(english ? "API URL and model name are required" : "API 地址和模型名称不能为空");
  }
}

/**
 * Streams a translation through the provider selected by `settings.provider`,
 * dispatching answer deltas to `onDelta` and reasoning deltas to `onReasoning`.
 * The provider is chosen via the registry, so this facade — and every caller
 * above it — stays vendor-agnostic (plan §7).
 */
export async function streamTranslation(
  text: string,
  settings: TranslatorSettings,
  signal: AbortSignal,
  onDelta: (delta: string) => void,
  onReasoning: (delta: string) => void = () => {}
): Promise<void> {
  if (isMachine(settings.provider)) {
    onDelta((await machineTranslate([text], settings, signal))[0]!);
    return;
  }
  assertTranslatable(settings);
  const config = toProviderConfig(settings);
  const request = toTranslationRequest(text, settings);
  const provider = getProvider(settings.provider);
  for await (const chunk of provider.translate(request, config, signal)) {
    if (chunk.type === "delta") onDelta(chunk.text);
    else if (chunk.type === "reasoning") onReasoning(chunk.text);
  }
}

/**
 * Verifies a model configuration by sending a tiny request. Returns a result
 * object rather than throwing, so the settings UI can display success and
 * failure messages uniformly.
 */
export async function testConnection(settings: TranslatorSettings, onAttempt?: () => void): Promise<TestConnectionResponse> {
  const english = settings.uiLanguage === "en";
  try {
    if ((providerRequiresApiKey(settings.provider) && !settings.apiKey.trim()) ||
        (!isMachine(settings.provider) && !settings.model.trim()) ||
        (settings.provider === "baidu" && !settings.modelProfiles.find(p => p.id === settings.activeModelId)?.appId?.trim())) return diagnostic("configuration", english);
    let origin: string;
    try {
      const url = new URL(validateApiUrl(settings.apiBaseUrl));
      // Match the port-stripped patterns used to request the grant (Chrome
      // match patterns do not carry ports, so a port-bearing pattern would
      // always report "not granted" for LAN endpoints on custom ports).
      origin = `${url.protocol}//${url.hostname}`;
    } catch { return diagnostic("configuration", english); }
    if (!(await browser.permissions.contains({ origins: [`${origin}/*`] }))) return diagnostic("permission", english);
    const profile = settings.modelProfiles.find(p => p.id === settings.activeModelId)!;
    const lane = await modelLane(new URL(validateApiUrl(settings.apiBaseUrl)).origin, profile);
    return await schedule(lane, false, AbortSignal.timeout(15_000), async () => {
    if (isMachine(settings.provider)) {
      const signal = AbortSignal.timeout(15_000);
      const unmeter = onAttempt ? registerMeter(signal, onAttempt) : () => {};
      try {
        await machineTranslate(["Hello"], { ...settings, sourceLanguage: "auto", targetLanguage: "简体中文" }, signal);
      } finally { unmeter(); }
      return { ok: true, message: "连接成功 / Connection successful" };
    }
    assertTranslatable(settings);
    const config = toProviderConfig(settings);
    return await getProvider(settings.provider).testConnection(config, onAttempt);
    }, settings.provider === "baidu", profile.maxConcurrency ?? 2);
  } catch (error) {
    return diagnose(error, english);
  }
}
