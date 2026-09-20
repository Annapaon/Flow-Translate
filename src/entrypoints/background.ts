import { handleTranslationCommand } from "../core/translation/commands";
import { attachTranslationPort } from "../core/translation/port";
import { pausedSites, disabledSites, isPaused } from "../shared/site-access";
import { getPublicSettings, getSettings, watchPublicSettings } from "../shared/settings";
import type { TranslatorSettings } from "../shared/types";
import { generateTranslationPrompt, testConnection } from "../core/providers";
import { diagnose } from "../core/providers/diagnostics";
import { isMachine } from "../shared/provider-list";
import { settingsForFeature } from "../core/translation/model-routing";
import { modelLane, schedule } from "../core/translation/scheduler";
import { registerMeter } from "../core/translation/meter";
import {
  recordModelUsage,
  recordServiceCalls,
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
  // Firefox stores private settings in extension-origin IndexedDB instead.
  if (browser.storage.local.setAccessLevel) {
    void browser.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  }

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
    // Restricted pages or tabs opened before installation may have no receiver.
    void handleTranslationCommand(command, tab).catch(() => {});
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
    if (["selection-translation", "long-text-translation", "translation-stream", "page-translation"].includes(port.name)) attachTranslationPort(port);
    else port.disconnect();
  });

  browser.runtime.onMessage.addListener(async (message: { type?: string; settings?: TranslatorSettings; profileId?: string; name?: string; description?: string; currentPrompt?: string; requirements?: string } | null, sender) => {
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
    if (message.type === "generate-prompt") {
      const base = await getSettings();
      const en = base.uiLanguage === "en";
      const profileId = typeof message.profileId === "string" ? message.profileId : "";
      const profile = base.modelProfiles.find(item => item.id === profileId && item.enabled);
      if (!base.privacyConsentAccepted) return { ok: false, message: en ? "Accept the data handling notice first" : "请先确认数据处理说明" };
      if (!profile || isMachine(profile.provider)) return { ok: false, message: en ? "Select an enabled LLM service" : "请选择已启用的大模型服务" };
      const input = {
        name: String(message.name ?? "").slice(0, 100),
        description: String(message.description ?? "").slice(0, 300),
        currentPrompt: String(message.currentPrompt ?? "").slice(0, 20_000),
        requirements: String(message.requirements ?? "").slice(0, 2_000)
      };
      let calls = 0;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.min(profile.timeoutMs, 120_000));
      const unmeter = registerMeter(controller.signal, () => calls++);
      try {
        const settings = settingsForFeature(base, "selection", profile.id);
        const lane = await modelLane(new URL(settings.apiBaseUrl).origin, profile);
        const prompt = await schedule(lane, false, controller.signal,
          () => generateTranslationPrompt(input, settings, controller.signal), false, profile.maxConcurrency ?? 2);
        if (!sender.tab?.incognito) await recordModelUsage(profile.id, JSON.stringify(input).length, prompt.length);
        return { ok: true, prompt };
      } catch (error) {
        return { ok: false, message: diagnose(error, en).message };
      } finally {
        clearTimeout(timeout);
        unmeter();
        if (calls && !sender.tab?.incognito) await recordServiceCalls(profile.id, calls).catch(() => {});
      }
    }
    if (message.type === "test-connection" && message.settings) {
      let calls = 0;
      try { return await testConnection(message.settings, () => calls++); }
      finally {
        // Draft profiles have no card yet. Existing profiles include connection attempts.
        if (calls && !sender.tab?.incognito && (await getSettings()).modelProfiles.some(p => p.id === message.settings!.activeModelId))
          await recordServiceCalls(message.settings.activeModelId, calls);
      }
    }
    return undefined;
  });
});
