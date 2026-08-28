import { getPublicSettings, getSettings, watchPublicSettings } from "../shared/settings";
import type { ClientMessage, ServerMessage, TestConnectionResponse, TranslatorSettings } from "../shared/types";
import { isRetryableTranslationError, streamTranslation, testConnection } from "../core/openai";
import {
  addHistory,
  cacheTranslation,
  clearHistory,
  clearHistoryAndCache,
  createCacheKey,
  findCachedTranslation,
  deleteHistoryEntry,
  getHistory,
  getModelUsage,
  clearModelUsage,
  clearAllModelUsage,
  recordModelUsage,
  toggleHistoryFavorite
} from "../shared/history";

export default defineBackground(() => {
  // Prevent content scripts from reading model credentials from extension storage.
  void browser.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });

  const retryDelay = (milliseconds: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });

  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: "translate-selection",
      title: "翻译选中的文本",
      contexts: ["selection"]
    });
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "translate-selection" && info.selectionText && tab?.id) {
      browser.tabs.sendMessage(tab.id, { type: "external-translate", text: info.selectionText });
    }
  });

  browser.commands.onCommand.addListener(async (command, tab) => {
    if (command === "translate-selection" && tab?.id) {
      await browser.tabs.sendMessage(tab.id, { type: "translate-current-selection" });
    }
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.sender?.id !== browser.runtime.id) {
      port.disconnect();
      return;
    }
    if (port.name === "public-settings") {
      const postSettings = (settings: Awaited<ReturnType<typeof getPublicSettings>>) => {
        try { port.postMessage(settings); } catch { /* The page was closed. */ }
      };
      void getPublicSettings().then(postSettings);
      const unwatch = watchPublicSettings(postSettings);
      port.onDisconnect.addListener(unwatch);
      return;
    }
    if (port.name !== "translation-stream") {
      port.disconnect();
      return;
    }
    const portRequestIds = new Set<string>();
    const portControllers = new Map<string, AbortController>();

    const send = (message: ServerMessage) => {
      try { port.postMessage(message); } catch { /* The page was closed. */ }
    };

    port.onMessage.addListener(async (rawMessage: unknown) => {
      if (!rawMessage || typeof rawMessage !== "object" || !("type" in rawMessage)) return;
      const message = rawMessage as ClientMessage;
      if (message.type === "cancel") {
        if (typeof message.requestId !== "string" || message.requestId.length > 100) return;
        portControllers.get(message.requestId)?.abort();
        portControllers.delete(message.requestId);
        return;
      }

      if (message.type !== "translate" || typeof message.requestId !== "string" || message.requestId.length > 100 ||
        typeof message.text !== "string" || message.text.length < 1 || message.text.length > 100_000) return;

      portControllers.get(message.requestId)?.abort();
      const controller = new AbortController();
      portControllers.set(message.requestId, controller);
      portRequestIds.add(message.requestId);
      send({ type: "start", requestId: message.requestId });
      let english = false;

      try {
        const settings = await getSettings();
        english = settings.uiLanguage === "en";
        if (!settings.privacyConsentAccepted) throw new Error(english ? "Accept the data handling notice before translating" : "请先同意数据处理说明再翻译");
        const cacheKey = await createCacheKey(message.text, settings);
        const recordHistory = (translatedText: string) => settings.enableHistory
          ? addHistory({
              sourceText: message.text,
              translatedText,
              targetLanguage: settings.targetLanguage,
              model: settings.model,
              pageTitle: message.pageTitle?.slice(0, 500),
              pageUrl: message.pageUrl?.slice(0, 2_000)
            })
          : Promise.resolve();

        if (settings.enableCache) {
          const cached = await findCachedTranslation(cacheKey);
          if (cached) {
            send({ type: "delta", requestId: message.requestId, text: cached });
            await recordHistory(cached);
            send({ type: "finish", requestId: message.requestId, cached: true });
            return;
          }
        }

        const timeout = setTimeout(() => controller.abort("timeout"), settings.timeoutMs);
        let translatedText = "";
        try {
          for (let attempt = 0; attempt < 3; attempt += 1) {
            translatedText = "";
            try {
              await streamTranslation(
                message.text,
                settings,
                controller.signal,
                (text) => {
                  translatedText += text;
                  if (translatedText.length > 2_000_000) throw new Error(english ? "Model response exceeded the safety limit" : "模型响应超过安全限制");
                  send({ type: "delta", requestId: message.requestId, text });
                },
                (text) => send({ type: "reasoning", requestId: message.requestId, text })
              );
              break;
            } catch (error) {
              if (controller.signal.aborted || attempt === 2 || !isRetryableTranslationError(error)) throw error;
              send({ type: "retry", requestId: message.requestId, attempt: attempt + 1 });
              await retryDelay(750 * 2 ** attempt, controller.signal);
            }
          }
          await Promise.all([
            settings.enableCache ? cacheTranslation(cacheKey, translatedText) : Promise.resolve(),
            recordHistory(translatedText),
            recordModelUsage(settings.activeModelId, message.text.length, translatedText.length)
          ]);
          send({ type: "finish", requestId: message.requestId });
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        const messageText = controller.signal.aborted
          ? (english ? "Translation cancelled or timed out" : "翻译已取消或请求超时")
          : error instanceof Error ? error.message : (english ? "Translation request failed" : "翻译请求失败");
        send({ type: "error", requestId: message.requestId, message: messageText });
      } finally {
        portControllers.delete(message.requestId);
        portRequestIds.delete(message.requestId);
      }
    });

    port.onDisconnect.addListener(() => {
      for (const requestId of portRequestIds) {
        portControllers.get(requestId)?.abort();
        portControllers.delete(requestId);
      }
      portRequestIds.clear();
    });
  });

  browser.runtime.onMessage.addListener(async (message: { type?: string; settings?: TranslatorSettings } | null, sender) => {
    if (!message || typeof message !== "object") return undefined;
    const extensionPage = Boolean(sender.url?.startsWith(browser.runtime.getURL("/")));
    if (message.type === "open-options") {
      await browser.tabs.create({ url: browser.runtime.getURL("/options.html") });
      return { ok: true };
    }
    if (!extensionPage) return undefined;
    if (message.type === "get-history") return getHistory();
    if (message.type === "toggle-history-favorite" && "id" in message && typeof message.id === "string") {
      return toggleHistoryFavorite(message.id);
    }
    if (message.type === "delete-history" && "id" in message && typeof message.id === "string") {
      return deleteHistoryEntry(message.id);
    }
    if (message.type === "clear-history") {
      await clearHistory();
      return { ok: true };
    }
    if (message.type === "get-model-usage") return getModelUsage();
    if (message.type === "clear-model-usage" && "id" in message && typeof message.id === "string") {
      return clearModelUsage(message.id);
    }
    if (message.type === "clear-local-data") {
      await Promise.all([clearHistoryAndCache(), clearAllModelUsage()]);
      return { ok: true };
    }
    if (message.type === "test-connection" && message.settings) {
      try {
        await testConnection(message.settings);
        return { ok: true, message: message.settings.uiLanguage === "en" ? "Connected; the model returned content" : "连接成功，模型已返回内容" } satisfies TestConnectionResponse;
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : (message.settings.uiLanguage === "en" ? "Connection failed" : "连接失败")
        } satisfies TestConnectionResponse;
      }
    }
    return undefined;
  });
});
