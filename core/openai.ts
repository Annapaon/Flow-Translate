import type { TranslatorSettings } from "../shared/types";
import { redactSensitive, validateApiUrl } from "../shared/security";

const MAX_STREAM_BUFFER = 2 * 1024 * 1024;

function endpointFor(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, "");
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

function safeErrorMessage(status: number, body: string, english = false, secrets: string[] = []): string {
  let detail = body.slice(0, 500);
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string };
    detail = parsed.error?.message ?? parsed.message ?? detail;
  } catch {
    // The response was not JSON; use the shortened body.
  }
  detail = redactSensitive(detail, secrets);
  return english ? `Request failed (HTTP ${status})${detail ? `: ${detail}` : ""}` : `请求失败（HTTP ${status}）${detail ? `：${detail}` : ""}`;
}

class TranslationRequestError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "TranslationRequestError";
  }
}

export function isRetryableTranslationError(error: unknown): boolean {
  return error instanceof TranslationRequestError
    ? error.retryable
    : error instanceof TypeError;
}

function httpError(status: number, body: string, english = false, secrets: string[] = []): TranslationRequestError {
  return new TranslationRequestError(
    safeErrorMessage(status, body, english, secrets),
    status === 408 || status === 409 || status === 425 || status === 429 || status >= 500
  );
}

const OUTPUT_INSTRUCTIONS = {
  translation: "只输出译文。",
  explanation: "先输出译文，再用简短要点解释关键表达。",
  vocabulary: "先输出译文，再列出重要词汇及其含义。",
  grammar: "先输出译文，再简要说明关键语法结构。"
} as const;

function prompts(text: string, settings: TranslatorSettings) {
  const system = [
    renderPromptTemplate(settings.systemPrompt, settings),
    renderPromptTemplate(settings.scenePrompts[settings.translationScene], settings),
    OUTPUT_INSTRUCTIONS[settings.outputMode],
    "使用纯文本输出，不要使用 Markdown 标题、列表、代码块或其他 Markdown 标记。",
    settings.enableThinking ? "" : "不要输出分析或推理过程。"
  ].filter(Boolean).join("\n");
  const user = `源语言：${settings.sourceLanguage}\n目标语言：${settings.targetLanguage}\n\n<source_text>\n${text}\n</source_text>`;
  return { system, user };
}

async function readSse(response: Response, handle: (event: any) => void, english = false, secrets: string[] = []): Promise<void> {
  if (!response.ok) throw httpError(response.status, await response.text(), english, secrets);
  if (!response.body) throw new Error(english ? "The model service returned no readable stream" : "模型服务没有返回可读取的响应流");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    if (buffer.length > MAX_STREAM_BUFFER) throw new Error(english ? "Model response exceeded the safety limit" : "模型响应超过安全限制");
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try { handle(JSON.parse(data)); } catch { /* Ignore provider keep-alives. */ }
    }
    if (done) break;
  }
  if (buffer.startsWith("data:")) {
    try { handle(JSON.parse(buffer.slice(5).trim())); } catch { /* Ignore incomplete tail. */ }
  }
}

async function streamAnthropic(text: string, settings: TranslatorSettings, signal: AbortSignal, onDelta: (delta: string) => void, onReasoning: (delta: string) => void) {
  const base = validateApiUrl(settings.apiBaseUrl);
  // Anthropic SDK-style base URLs omit `/v1`; official and compatible
  // gateways expect the Messages endpoint at `/v1/messages`. A URL already
  // ending in `/v1` or `/messages` is also accepted to avoid double-appending.
  const endpoint = /\/messages$/i.test(base)
    ? base
    : /\/v1$/i.test(base)
      ? `${base}/messages`
      : `${base}/v1/messages`;
  const prompt = prompts(text, settings);
  const activeProfile = settings.modelProfiles.find((profile) => profile.id === settings.activeModelId);
  const authMode = activeProfile?.authMode ?? "x-api-key";
  const authHeaders = {
    ...(authMode === "x-api-key" || authMode === "both" ? { "x-api-key": settings.apiKey.trim() } : {}),
    ...(authMode === "bearer" || authMode === "both" ? { Authorization: `Bearer ${settings.apiKey.trim()}` } : {})
  };
  const response = await fetch(endpoint, {
    method: "POST", signal,
    // Anthropic-compatible gateways commonly accept either the official
    // x-api-key header or Bearer authentication. Supplying both keeps the
    // profile portable, while custom headers can override either value.
    headers: { "Content-Type": "application/json", ...authHeaders, "anthropic-version": "2023-06-01", ...settings.customHeaders },
    body: JSON.stringify({ model: settings.model.trim(), max_tokens: settings.maxOutputTokens, temperature: settings.temperature, stream: true, system: prompt.system, messages: [{ role: "user", content: prompt.user }] })
  });
  let started = false;
  await readSse(response, (event) => {
    if (event.type !== "content_block_delta") return;
    if (event.delta?.type === "thinking_delta" && settings.enableThinking) onReasoning(event.delta.thinking ?? "");
    if (event.delta?.type === "text_delta") {
      const value = String(event.delta.text ?? "");
      const normalized = started ? value : value.replace(/^\s+/, "");
      if (normalized) { started = true; onDelta(normalized); }
    }
  }, settings.uiLanguage === "en", [settings.apiKey]);
}

async function streamGemini(text: string, settings: TranslatorSettings, signal: AbortSignal, onDelta: (delta: string) => void) {
  const base = validateApiUrl(settings.apiBaseUrl);
  const endpoint = `${base}/models/${encodeURIComponent(settings.model.trim())}:streamGenerateContent?alt=sse`;
  const prompt = prompts(text, settings);
  const response = await fetch(endpoint, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", "x-goog-api-key": settings.apiKey.trim(), ...settings.customHeaders },
    body: JSON.stringify({ system_instruction: { parts: [{ text: prompt.system }] }, contents: [{ role: "user", parts: [{ text: prompt.user }] }], generationConfig: { temperature: settings.temperature, maxOutputTokens: settings.maxOutputTokens } })
  });
  let started = false;
  await readSse(response, (event) => {
    const value = (event.candidates?.[0]?.content?.parts ?? []).map((part: { text?: string }) => part.text ?? "").join("");
    const normalized = started ? value : value.replace(/^\s+/, "");
    if (normalized) { started = true; onDelta(normalized); }
  }, settings.uiLanguage === "en", [settings.apiKey]);
}

function renderPromptTemplate(template: string, settings: TranslatorSettings): string {
  const variables: Record<string, string> = {
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    outputMode: settings.outputMode,
    scene: settings.translationScene
  };
  return template.replace(/\{\{\s*(sourceLanguage|targetLanguage|outputMode|scene)\s*\}\}/g, (placeholder, name: string) =>
    variables[name] ?? placeholder
  );
}

export async function streamTranslation(
  text: string,
  settings: TranslatorSettings,
  signal: AbortSignal,
  onDelta: (delta: string) => void,
  onReasoning: (delta: string) => void = () => {}
): Promise<void> {
  if (["openai-compatible", "anthropic", "gemini"].includes(settings.provider) && !settings.apiKey.trim()) {
    throw new Error(settings.uiLanguage === "en" ? "Enter an API key in extension settings first" : "请先在扩展设置中填写 API Key");
  }
  if (!settings.apiBaseUrl.trim() || !settings.model.trim()) {
    throw new Error(settings.uiLanguage === "en" ? "API URL and model name are required" : "API 地址和模型名称不能为空");
  }
  settings = { ...settings, apiBaseUrl: validateApiUrl(settings.apiBaseUrl) };

  if (settings.provider === "anthropic") return streamAnthropic(text, settings, signal, onDelta, onReasoning);
  if (settings.provider === "gemini") return streamGemini(text, settings, signal, onDelta);

  const prompt = prompts(text, settings);
  const requestBody = {
      model: settings.model.trim(),
      stream: true,
      temperature: settings.temperature,
      messages: [
        {
          role: "system",
          content: prompt.system
        },
        {
          role: "user",
          content: prompt.user
        }
      ]
  };

  const sendRequest = (includeThinkingSwitch: boolean, tokenField: "max_tokens" | "max_completion_tokens") => fetch(endpointFor(settings.apiBaseUrl), {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(settings.apiKey.trim() ? { Authorization: `Bearer ${settings.apiKey.trim()}` } : {}),
      ...settings.customHeaders
    },
    body: JSON.stringify({
      ...requestBody,
      [tokenField]: settings.maxOutputTokens,
      ...(includeThinkingSwitch ? { enable_thinking: settings.enableThinking } : {})
    })
  });

  // Explicitly send false because several compatible providers reason by
  // default. Strict OpenAI servers may reject the extension field, in which
  // case retry once without it.
  let includeThinkingSwitch = true;
  let tokenField: "max_tokens" | "max_completion_tokens" = "max_tokens";
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await sendRequest(includeThinkingSwitch, tokenField);
    if (response.ok || (response.status !== 400 && response.status !== 422)) break;
    const body = await response.text();
    if (includeThinkingSwitch && /enable[_ -]?thinking|unknown|unrecognized|extra (?:field|input)|not permitted/i.test(body)) {
      includeThinkingSwitch = false;
      continue;
    }
    if (tokenField === "max_tokens" && /max_tokens|max completion tokens/i.test(body)) {
      tokenField = "max_completion_tokens";
      continue;
    }
    throw httpError(response.status, body, settings.uiLanguage === "en", [settings.apiKey]);
  }

  if (!response) throw new Error(settings.uiLanguage === "en" ? "The model request could not be sent" : "模型请求未能发出");
  if (!response.ok) throw httpError(response.status, await response.text(), settings.uiLanguage === "en", [settings.apiKey]);
  if (!response.body) throw new Error(settings.uiLanguage === "en" ? "The model service returned no readable stream" : "模型服务没有返回可读取的响应流");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let contentBuffer = "";
  let insideThinkTag = false;
  let hasEmittedAnswer = false;

  const keepPartialTag = (value: string, tag: string): number => {
    const max = Math.min(value.length, tag.length - 1);
    for (let length = max; length > 0; length -= 1) {
      if (tag.startsWith(value.slice(-length))) return length;
    }
    return 0;
  };

  const emitAnswer = (value: string) => {
    const normalized = hasEmittedAnswer ? value : value.replace(/^\s+/, "");
    if (normalized) {
      hasEmittedAnswer = true;
      onDelta(normalized);
    }
  };

  const emitReasoning = (value: string) => {
    if (settings.enableThinking && value) onReasoning(value);
  };

  const parseTaggedContent = (value: string, flush = false) => {
    contentBuffer += value;
    while (contentBuffer) {
      const tag = insideThinkTag ? "</think>" : "<think>";
      const index = contentBuffer.toLowerCase().indexOf(tag);
      if (index >= 0) {
        const beforeTag = contentBuffer.slice(0, index);
        if (insideThinkTag) emitReasoning(beforeTag);
        else emitAnswer(beforeTag);
        contentBuffer = contentBuffer.slice(index + tag.length);
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

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    if (buffer.length > MAX_STREAM_BUFFER) throw new Error(settings.uiLanguage === "en" ? "Model response exceeded the safety limit" : "模型响应超过安全限制");
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const event = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string; reasoning_content?: string; reasoning?: string } }>;
          type?: string;
          delta?: string;
        };
        const choiceDelta = event.choices?.[0]?.delta;
        const reasoning = choiceDelta?.reasoning_content ?? choiceDelta?.reasoning;
        if (settings.enableThinking && reasoning) onReasoning(reasoning);
        const delta = choiceDelta?.content ??
          (event.type === "response.output_text.delta" ? event.delta : undefined);
        if (delta) parseTaggedContent(delta);
      } catch {
        // Ignore keep-alives and provider-specific non-JSON events.
      }
    }

    if (done) break;
  }
  parseTaggedContent("", true);
}

export async function testConnection(settings: TranslatorSettings): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(settings.timeoutMs, 20_000));
  try {
    let received = false;
    await streamTranslation(
      "hello",
      { ...settings, targetLanguage: "简体中文" },
      controller.signal,
      () => { received = true; },
      () => { received = true; }
    );
    if (!received) throw new Error(settings.uiLanguage === "en" ? "Connected, but the model returned no text" : "连接成功，但模型没有返回文本内容");
  } finally {
    clearTimeout(timeout);
  }
}
