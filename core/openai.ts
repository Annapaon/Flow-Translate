import type { TranslatorSettings } from "../shared/types";

function endpointFor(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, "");
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

function safeErrorMessage(status: number, body: string): string {
  let detail = body.slice(0, 500);
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string };
    detail = parsed.error?.message ?? parsed.message ?? detail;
  } catch {
    // The response was not JSON; use the shortened body.
  }
  return `请求失败（HTTP ${status}）${detail ? `：${detail}` : ""}`;
}

export async function streamTranslation(
  text: string,
  settings: TranslatorSettings,
  signal: AbortSignal,
  onDelta: (delta: string) => void,
  onReasoning: (delta: string) => void = () => {}
): Promise<void> {
  if (!settings.apiKey.trim()) throw new Error("请先在扩展设置中填写 API Key");
  if (!settings.apiBaseUrl.trim() || !settings.model.trim()) {
    throw new Error("API 地址和模型名称不能为空");
  }

  const requestBody = {
      model: settings.model.trim(),
      stream: true,
      temperature: settings.temperature,
      messages: [
        {
          role: "system",
          content: settings.enableThinking
            ? settings.systemPrompt
            : `${settings.systemPrompt}\n不要输出分析、推理过程或 <think> 标签，只输出最终译文。`
        },
        {
          role: "user",
          content: `目标语言：${settings.targetLanguage}\n\n<source_text>\n${text}\n</source_text>`
        }
      ]
  };

  const sendRequest = (includeThinkingSwitch: boolean) => fetch(endpointFor(settings.apiBaseUrl), {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey.trim()}`
    },
    body: JSON.stringify({
      ...requestBody,
      ...(includeThinkingSwitch ? { enable_thinking: settings.enableThinking } : {})
    })
  });

  // Explicitly send false because several compatible providers reason by
  // default. Strict OpenAI servers may reject the extension field, in which
  // case retry once without it.
  let response = await sendRequest(true);
  if (!response.ok && (response.status === 400 || response.status === 422)) {
    const firstError = await response.text();
    if (/enable[_ -]?thinking|unknown|unrecognized|extra (?:field|input)|not permitted/i.test(firstError)) {
      response = await sendRequest(false);
    } else {
      throw new Error(safeErrorMessage(response.status, firstError));
    }
  }

  if (!response.ok) throw new Error(safeErrorMessage(response.status, await response.text()));
  if (!response.body) throw new Error("模型服务没有返回可读取的响应流");

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
    if (!received) throw new Error("连接成功，但模型没有返回文本内容");
  } finally {
    clearTimeout(timeout);
  }
}
