import { getSettings } from "../shared/settings";
import type { ClientMessage, ServerMessage, TestConnectionResponse, TranslatorSettings } from "../shared/types";
import { streamTranslation, testConnection } from "../core/openai";

export default defineBackground(() => {
  const controllers = new Map<string, AbortController>();

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
    if (port.name !== "translation-stream") return;
    const portRequestIds = new Set<string>();

    const send = (message: ServerMessage) => {
      try { port.postMessage(message); } catch { /* The page was closed. */ }
    };

    port.onMessage.addListener(async (message: ClientMessage) => {
      if (message.type === "cancel") {
        controllers.get(message.requestId)?.abort();
        controllers.delete(message.requestId);
        return;
      }

      const controller = new AbortController();
      controllers.set(message.requestId, controller);
      portRequestIds.add(message.requestId);
      send({ type: "start", requestId: message.requestId });

      try {
        const settings = await getSettings();
        const timeout = setTimeout(() => controller.abort("timeout"), settings.timeoutMs);
        try {
          await streamTranslation(
            message.text,
            settings,
            controller.signal,
            (text) => send({ type: "delta", requestId: message.requestId, text }),
            (text) => send({ type: "reasoning", requestId: message.requestId, text })
          );
          send({ type: "finish", requestId: message.requestId });
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        const messageText = controller.signal.aborted
          ? "翻译已取消或请求超时"
          : error instanceof Error ? error.message : "翻译请求失败";
        send({ type: "error", requestId: message.requestId, message: messageText });
      } finally {
        controllers.delete(message.requestId);
        portRequestIds.delete(message.requestId);
      }
    });

    port.onDisconnect.addListener(() => {
      for (const requestId of portRequestIds) {
        controllers.get(requestId)?.abort();
        controllers.delete(requestId);
      }
      portRequestIds.clear();
    });
  });

  browser.runtime.onMessage.addListener(async (message: { type?: string; settings?: TranslatorSettings }) => {
    if (message.type !== "test-connection" || !message.settings) return undefined;
    try {
      await testConnection(message.settings);
      return { ok: true, message: "连接成功，模型已返回内容" } satisfies TestConnectionResponse;
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "连接失败"
      } satisfies TestConnectionResponse;
    }
  });
});
