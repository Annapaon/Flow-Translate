import { networkAttempt } from "../translation/meter";
import { httpError, TranslationRequestError } from "./errors";

export const MAX_STREAM_BUFFER = 2 * 1024 * 1024;
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

function sizeError(english: boolean): TranslationRequestError {
  return new TranslationRequestError(english ? "Model response exceeded the safety limit" : "模型响应超过安全限制", false);
}

/** Error bodies are untrusted too; never buffer an unlimited response. */
export async function readLimitedText(response: Response, english = false): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > MAX_STREAM_BUFFER) throw sizeError(english);
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/**
 * fetch() rejects with a bare TypeError ("Failed to fetch") when the host
 * is unreachable, DNS fails, or the connection is refused. Turn that into a
 * readable cause so the settings page and the translation overlay can show
 * why the model could not be reached. Kept retryable so transient network
 * glitches still benefit from the retry logic.
 */
export async function fetchModel(endpoint: string, init: RequestInit, english: boolean): Promise<Response> {
  try {
    networkAttempt(init.signal);
    const response = await fetch(endpoint, { ...init, credentials: "omit", redirect: "error" });
    if (response.status === 429) {
      const raw = response.headers.get("Retry-After");
      const wait = raw ? Math.max(0, Number.isFinite(Number(raw)) ? Number(raw) * 1000 : Date.parse(raw) - Date.now()) : 0;
      // Keep server response bodies out of rate-limit diagnostics.
      await response.body?.cancel();
      throw httpError(429, "rate limited / 请求频率超限", english, [], Math.min(wait || 0, 60000));
    }
    return response;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new TranslationRequestError(
        english
          ? "Cannot reach the model service. Check that the API URL (including the port) is correct, the service is running, and this device can reach it — LAN services require being on the same local network."
          : "无法连接到模型服务。请检查 API 地址（含端口）是否正确、服务是否已启动，以及当前设备能否访问该地址——局域网服务需要处于同一局域网内。",
        true
      );
    }
    throw error;
  }
}

/**
 * Parses an SSE response incrementally, yielding each `data:` JSON event as it
 * arrives so providers can stream chunks without buffering the whole reply.
 * Non-JSON keep-alives are skipped; the underlying reader is released when the
 * consumer stops early (abort or error).
 */
export async function* sseEvents(response: Response, english = false, secrets: string[] = []): AsyncGenerator<any> {
  if (!response.ok) throw httpError(response.status, await readLimitedText(response, english), english, secrets);
  if (!response.body) throw new TranslationRequestError(english ? "The model service returned no readable stream" : "模型服务没有返回可读取的响应流", false);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      bytes += value?.byteLength ?? 0;
      if (bytes > MAX_RESPONSE_BYTES) throw sizeError(english);
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > MAX_STREAM_BUFFER) throw new TranslationRequestError(english ? "Model response exceeded the safety limit" : "模型响应超过安全限制", false);
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let parsed: unknown;
        try { parsed = JSON.parse(data); } catch { continue; /* Ignore provider keep-alives. */ }
        yield parsed;
      }
      if (done) break;
    }
    if (buffer.startsWith("data:")) {
      try { yield JSON.parse(buffer.slice(5).trim()); } catch { /* Ignore incomplete tail. */ }
    }
  } finally {
    await reader.cancel().catch(() => { /* Already closed. */ });
    reader.releaseLock();
  }
}
