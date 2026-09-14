import { registerMeter } from "../translation/meter";
import type { ProviderConfig, TestResult, TranslationProvider, TranslationRequest } from "./types";

/** A minimal, self-contained request used only to verify connectivity. */
function buildTestRequest(): TranslationRequest {
  return {
    text: "hello",
    sourceLanguage: "自动检测",
    targetLanguage: "简体中文",
    systemPrompt: "你是一名专业翻译。请将 <source_text> 中的内容翻译为简体中文，只输出译文。",
    userPrompt: "源语言：自动检测\n目标语言：简体中文\n\n<source_text>\nhello\n</source_text>"
  };
}

/**
 * Shared connection test used by every provider. Sends a tiny request with its
 * own AbortController and a hard 20s ceiling (independent of the user's
 * configured timeout, which can be much longer), and reports whether any text
 * came back. Never throws — all outcomes are returned as a TestResult so the
 * settings UI can show them directly.
 */
export async function runConnectionTest(provider: TranslationProvider, config: ProviderConfig, onAttempt?: () => void): Promise<TestResult> {
  const controller = new AbortController();
  const unmeter = onAttempt ? registerMeter(controller.signal, onAttempt) : () => {};
  const timeoutMs = Math.min(config.timeoutMs, 20_000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const english = config.english;
  try {
    let received = false;
    for await (const chunk of provider.translate(buildTestRequest(), config, controller.signal)) {
      if ((chunk.type === "delta" || chunk.type === "reasoning") && chunk.text) received = true;
    }
    if (!received) {
      return { ok: false, message: english ? "Connected, but the model returned no text" : "连接成功，但模型没有返回文本内容" };
    }
    return { ok: true, message: english ? "Connected; the model returned content" : "连接成功，模型已返回内容" };
  } catch (error) {
    // Only the timeout aborts the controller here, so an abort means the
    // service never answered in time. Surface that as the cause instead of
    // the raw AbortError text.
    if (controller.signal.aborted) {
      const seconds = Math.round(timeoutMs / 1_000);
      return {
        ok: false,
        message: english
          ? `Connection timed out after ${seconds}s. Check that the model service is running and that the address and port are correct.`
          : `连接超时（${seconds} 秒）。请检查模型服务是否已启动、地址和端口是否正确。`
      };
    }
    return { ok: false, message: error instanceof Error ? error.message : (english ? "Connection failed" : "连接失败") };
  } finally {
    clearTimeout(timeout);
    unmeter();
  }
}
