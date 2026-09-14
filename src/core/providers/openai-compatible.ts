import { httpError, TranslationRequestError } from "./errors";
import { fetchModel, sseEvents, readLimitedText } from "./sse";
import type { ProviderConfig, TestResult, TranslationChunk, TranslationProvider, TranslationRequest } from "./types";
import { runConnectionTest } from "./test-connection";

/** Appends `/chat/completions` unless the user already typed a full endpoint. */
function endpointFor(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, "");
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

/**
 * OpenAI-compatible chat-completions streaming provider. Also backs every
 * local inference server that exposes the OpenAI protocol (Ollama, LM Studio,
 * Xinference, vLLM, SGLang), which the registry routes here.
 *
 * Two protocol quirks are negotiated transparently: some gateways reject the
 * `enable_thinking` extension field, and newer OpenAI servers require
 * `max_completion_tokens` instead of `max_tokens`. Both surface as 400/422 and
 * are retried with a corrected body before any chunk is emitted.
 */
async function* stream(request: TranslationRequest, config: ProviderConfig, signal: AbortSignal): AsyncGenerator<TranslationChunk> {
  const english = config.english;
  const requestBody = {
    model: config.model.trim(),
    stream: true,
    temperature: config.temperature,
    messages: [
      { role: "system", content: request.systemPrompt },
      { role: "user", content: request.userPrompt }
    ]
  };

  const sendRequest = (includeThinkingSwitch: boolean, tokenField: "max_tokens" | "max_completion_tokens") => fetchModel(endpointFor(config.apiBaseUrl), {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey.trim() ? { Authorization: `Bearer ${config.apiKey.trim()}` } : {}),
      ...config.customHeaders
    },
    body: JSON.stringify({
      ...requestBody,
      [tokenField]: config.maxOutputTokens,
      ...(includeThinkingSwitch ? { enable_thinking: config.enableThinking } : {})
    })
  }, english);

  yield { type: "start" };

  // Explicitly send enable_thinking because several compatible providers reason
  // by default. Strict OpenAI servers may reject the extension field, in which
  // case retry once without it.
  let includeThinkingSwitch = true;
  let tokenField: "max_tokens" | "max_completion_tokens" = "max_tokens";
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await sendRequest(includeThinkingSwitch, tokenField);
    if (response.ok || (response.status !== 400 && response.status !== 422)) break;
    const body = await readLimitedText(response, english);
    if (includeThinkingSwitch && /enable[_ -]?thinking|unknown|unrecognized|extra (?:field|input)|not permitted/i.test(body)) {
      includeThinkingSwitch = false;
      continue;
    }
    if (tokenField === "max_tokens" && /max_tokens|max completion tokens/i.test(body)) {
      tokenField = "max_completion_tokens";
      continue;
    }
    throw httpError(response.status, body, english, [config.apiKey, ...Object.values(config.customHeaders)]);
  }

  if (!response) throw new TranslationRequestError(english ? "The model request could not be sent" : "模型请求未能发出", false);
  if (!response.ok) throw httpError(response.status, await readLimitedText(response, english), english, [config.apiKey, ...Object.values(config.customHeaders)]);
  if (!response.body) throw new TranslationRequestError(english ? "The model service returned no readable stream" : "模型服务没有返回可读取的响应流", false);

  let contentBuffer = "";
  let insideThinkTag = false;
  let hasEmittedAnswer = false;

  const keepPartialTag = (value: string, tag: string): number => {
    const max = Math.min(value.length, tag.length - 1);
    for (let length = max; length > 0; length -= 1) {
      // The tags are plain ASCII, so a lowercased tail only matches when it is
      // itself ASCII and length-preserving; comparing the tail (not the whole
      // buffer) keeps Unicode case expansion from shifting the boundary.
      if (tag.startsWith(value.slice(-length).toLowerCase())) return length;
    }
    return 0;
  };

  // The tag parser is synchronous and recursive, so it queues chunks here;
  // the event loop below drains the queue after every SSE event, keeping
  // output streaming at event granularity.
  const pending: TranslationChunk[] = [];
  const emitAnswer = (value: string) => {
    const normalized = hasEmittedAnswer ? value : value.replace(/^\s+/, "");
    if (normalized) {
      hasEmittedAnswer = true;
      pending.push({ type: "delta", text: normalized });
    }
  };
  const emitReasoning = (value: string) => {
    if (config.enableThinking && value) pending.push({ type: "reasoning", text: value });
  };

  const parseTaggedContent = (value: string, flush = false) => {
    contentBuffer += value;
    while (contentBuffer) {
      const tag = insideThinkTag ? "</think>" : "<think>";
      // Match case-insensitively on the original buffer. Indexing a fully
      // lowercased copy instead would misalign when a character changes
      // length in lowercasing (e.g. "İ" → "i̇").
      const match = (insideThinkTag ? /<\/think>/i : /<think>/i).exec(contentBuffer);
      if (match?.index !== undefined) {
        const beforeTag = contentBuffer.slice(0, match.index);
        if (insideThinkTag) emitReasoning(beforeTag);
        else emitAnswer(beforeTag);
        contentBuffer = contentBuffer.slice(match.index + match[0].length);
        insideThinkTag = !insideThinkTag;
        continue;
      }

      const retainedLength = flush ? 0 : keepPartialTag(contentBuffer.toLowerCase(), tag);
      const readyLength = contentBuffer.length - retainedLength;
      if (readyLength <= 0) return;
      const ready = contentBuffer.slice(0, readyLength);
      contentBuffer = contentBuffer.slice(readyLength);
      if (insideThinkTag) emitReasoning(ready);
      else emitAnswer(ready);
      return;
    }
  };

  for await (const event of sseEvents(response, english, [config.apiKey, ...Object.values(config.customHeaders)])) {
    const typed = event as {
      choices?: Array<{ delta?: { content?: string; reasoning_content?: string; reasoning?: string } }>;
      type?: string;
      delta?: string;
    };
    const choiceDelta = typed.choices?.[0]?.delta;
    const reasoning = choiceDelta?.reasoning_content ?? choiceDelta?.reasoning;
    if (config.enableThinking && reasoning) pending.push({ type: "reasoning", text: reasoning });
    const delta = choiceDelta?.content ??
      (typed.type === "response.output_text.delta" ? typed.delta : undefined);
    if (delta) parseTaggedContent(delta);
    while (pending.length) yield pending.shift()!;
  }
  parseTaggedContent("", true);
  while (pending.length) yield pending.shift()!;
  yield { type: "finish" };
}

export const openAiCompatibleProvider: TranslationProvider = {
  id: "openai-compatible",
  translate: (request, config, signal) => stream(request, config, signal),
  testConnection: (config, onAttempt): Promise<TestResult> => runConnectionTest(openAiCompatibleProvider, config, onAttempt)
};
