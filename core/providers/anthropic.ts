import { fetchModel, sseEvents } from "./sse";
import type { ProviderConfig, TestResult, TranslationChunk, TranslationProvider, TranslationRequest } from "./types";
import { runConnectionTest } from "./test-connection";

/**
 * Anthropic Messages API provider. Works against the official API and
 * Anthropic-compatible gateways. `config.apiBaseUrl` is already validated and
 * normalized; the `/v1/messages` endpoint is derived from it, accepting bases
 * that already end in `/v1` or `/messages` to avoid double-appending.
 */
async function* stream(request: TranslationRequest, config: ProviderConfig, signal: AbortSignal): AsyncGenerator<TranslationChunk> {
  const base = config.apiBaseUrl;
  const endpoint = /\/messages$/i.test(base)
    ? base
    : /\/v1$/i.test(base)
      ? `${base}/messages`
      : `${base}/v1/messages`;

  const authHeaders = {
    ...(config.authMode === "x-api-key" || config.authMode === "both" ? { "x-api-key": config.apiKey.trim() } : {}),
    ...(config.authMode === "bearer" || config.authMode === "both" ? { Authorization: `Bearer ${config.apiKey.trim()}` } : {})
  };

  yield { type: "start" };

  const response = await fetchModel(endpoint, {
    method: "POST",
    signal,
    // Anthropic-compatible gateways commonly accept either the official
    // x-api-key header or Bearer authentication. Supplying both keeps the
    // profile portable, while custom headers can override either value.
    headers: { "Content-Type": "application/json", ...authHeaders, "anthropic-version": "2023-06-01", ...config.customHeaders },
    body: JSON.stringify({
      model: config.model.trim(),
      max_tokens: config.maxOutputTokens,
      stream: true,
      system: request.systemPrompt,
      messages: [{ role: "user", content: request.userPrompt }],
      // Extended thinking must be requested explicitly, otherwise the API
      // never emits thinking_delta. It requires a budget of at least 1024
      // tokens below max_tokens, and rejects temperature values other than 1,
      // so temperature is only sent when thinking is off. Profiles with too
      // small a token limit fall back to a plain translation request.
      ...(config.enableThinking && config.maxOutputTokens > 1_024
        ? {
            thinking: {
              type: "enabled" as const,
              budget_tokens: Math.min(Math.max(1_024, Math.floor(config.maxOutputTokens / 2)), config.maxOutputTokens - 1)
            }
          }
        : { temperature: config.temperature })
    })
  }, config.english);

  let started = false;
  for await (const event of sseEvents(response, config.english, [config.apiKey, ...Object.values(config.customHeaders)])) {
    if (event.type !== "content_block_delta") continue;
    if (event.delta?.type === "thinking_delta" && config.enableThinking && event.delta.thinking) {
      yield { type: "reasoning", text: event.delta.thinking };
    }
    if (event.delta?.type === "text_delta") {
      const value = String(event.delta.text ?? "");
      const normalized = started ? value : value.replace(/^\s+/, "");
      if (normalized) { started = true; yield { type: "delta", text: normalized }; }
    }
  }
  yield { type: "finish" };
}

export const anthropicProvider: TranslationProvider = {
  id: "anthropic",
  translate: (request, config, signal) => stream(request, config, signal),
  testConnection: (config): Promise<TestResult> => runConnectionTest(anthropicProvider, config)
};
