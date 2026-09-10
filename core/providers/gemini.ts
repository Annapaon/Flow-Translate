import { fetchModel, sseEvents } from "./sse";
import type { ProviderConfig, TestResult, TranslationChunk, TranslationProvider, TranslationRequest } from "./types";
import { runConnectionTest } from "./test-connection";

/**
 * Gemini native protocol provider (Google Generative Language API). Streams
 * via `:streamGenerateContent?alt=sse` and authenticates with the
 * `x-goog-api-key` header.
 */
async function* stream(request: TranslationRequest, config: ProviderConfig, signal: AbortSignal): AsyncGenerator<TranslationChunk> {
  const endpoint = `${config.apiBaseUrl}/models/${encodeURIComponent(config.model.trim())}:streamGenerateContent?alt=sse`;

  yield { type: "start" };

  const response = await fetchModel(endpoint, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", "x-goog-api-key": config.apiKey.trim(), ...config.customHeaders },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: request.systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: request.userPrompt }] }],
      generationConfig: { temperature: config.temperature, maxOutputTokens: config.maxOutputTokens }
    })
  }, config.english);

  let started = false;
  for await (const event of sseEvents(response, config.english, [config.apiKey, ...Object.values(config.customHeaders)])) {
    const value = (event.candidates?.[0]?.content?.parts ?? []).map((part: { text?: string }) => part.text ?? "").join("");
    const normalized = started ? value : value.replace(/^\s+/, "");
    if (normalized) { started = true; yield { type: "delta", text: normalized }; }
  }
  yield { type: "finish" };
}

export const geminiProvider: TranslationProvider = {
  id: "gemini",
  translate: (request, config, signal) => stream(request, config, signal),
  testConnection: (config): Promise<TestResult> => runConnectionTest(geminiProvider, config)
};
