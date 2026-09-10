import { attachTranslationPort } from "../core/translation/port";
import { pausedSites, disabledSites, isPaused } from "../shared/site-access";
import { getPublicSettings, getSettings, watchPublicSettings } from "../shared/settings";
import type { TranslatorSettings } from "../shared/types";
import { testConnection } from "../core/providers";
import {
  clearHistory,
  clearHistoryAndCache,
  deleteHistoryEntry,
  getHistory,
  getModelUsage,
  clearModelUsage,
  clearAllModelUsage,
  toggleHistoryFavorite
} from "../shared/history";

export default defineBackground(() => {
  // Prevent content scripts from reading model credentials from extension storage.
  void browser.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });

  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: "translate-selection",
      title: "翻译选中的文本",
      contexts: ["selection"]
    });
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "translate-selection" && info.selectionText && tab?.id) {
      // Tabs opened before the extension was installed have no content script.
      browser.tabs.sendMessage(tab.id, { type: "external-translate", text: info.selectionText }).catch(() => {});
    }
  });

  browser.commands.onCommand.addListener((command, tab) => {
    if (command === "translate-selection" && tab?.id) {
      // Same as above: not every tab hosts a content script.
      browser.tabs.sendMessage(tab.id, { type: "translate-current-selection" }).catch(() => {});
    }
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.sender?.id !== browser.runtime.id) {
      port.disconnect();
      return;
    }
    if (port.name === "public-settings") {
      const postSettings = (settings: Awaited<ReturnType<typeof getPublicSettings>>) => {
        void isPaused(port.sender?.url ?? "").then(paused => { try { port.postMessage({ ...settings, paused }); } catch {} });
      };
      void getPublicSettings().then(postSettings);
      const unwatch = watchPublicSettings(postSettings);
      const unpause = pausedSites.watch(() => { void getPublicSettings().then(postSettings); });
      const undisable = disabledSites.watch(() => { void getPublicSettings().then(postSettings); });
      port.onDisconnect.addListener(() => { unwatch(); unpause(); undisable(); });
      return;
    }
    if (port.name === "translation-stream" || port.name === "page-translation") attachTranslationPort(port);
    else port.disconnect();
  });

  browser.runtime.onMessage.addListener(async (message: { type?: string; settings?: TranslatorSettings } | null, sender) => {
    if (!message || typeof message !== "object") return undefined;
    const extensionPage = Boolean(sender.url?.startsWith(browser.runtime.getURL("/")));
    if (message.type === "open-options") {
      await browser.tabs.create({ url: browser.runtime.getURL("/options.html") });
      return { ok: true };
    }
    if (!extensionPage) return undefined;
    if (message.type === "site-state" || message.type === "site-pause") {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url || !/^https?:/.test(tab.url)) return { error: "此页面不支持 / Unsupported page" };
      const host = new URL(tab.url).hostname;
      const sites = await pausedSites.getValue();
      if (message.type === "site-pause" && "mode" in message) {
        if (message.mode === "permanent") await disabledSites.setValue([...new Set([...await disabledSites.getValue(), host])]);
        else if (message.mode === "restore-permanent") await disabledSites.setValue((await disabledSites.getValue()).filter(s => s !== host));
        else if (message.mode === "resume" || message.mode === "session") await pausedSites.setValue(message.mode === "resume" ? sites.filter(s => s !== host) : [...new Set([...sites, host])]);
      }
      return { host, paused: (await pausedSites.getValue()).includes(host), permanent: (await disabledSites.getValue()).includes(host) };
    }
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
      return testConnection(message.settings);
    }
    return undefined;
  });
});
