import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { getSettings, saveSettings } from "../../shared/settings";
import type { TranslatorSettings } from "../../shared/types";
import { DEFAULT_SETTINGS, TRANSLATION_SCENES } from "../../shared/types";
import "./style.css";

const LANGUAGES = ["简体中文", "繁體中文", "English", "日本語", "한국어", "Français", "Deutsch", "Español"];
const SOURCE_LANGUAGES = ["自动检测", ...LANGUAGES];

function App() {
  const [settings, setSettings] = useState<TranslatorSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings().then((value) => { setSettings(value); setReady(true); });
  }, []);
  useEffect(() => { document.title = settings.uiLanguage === "en" ? "Flow Translate" : "流译助手"; }, [settings.uiLanguage]);

  async function update(patch: Partial<TranslatorSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaved(false);
    await saveSettings(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1_200);
  }

  function openSettings() {
    browser.tabs.create({ url: browser.runtime.getURL("/options.html") });
    window.close();
  }

  async function openSidePanel() {
    await browser.sidePanel.open({ windowId: browser.windows.WINDOW_ID_CURRENT });
    window.close();
  }

  const enabledProfiles = settings.modelProfiles.filter((profile) => profile.enabled);
  const en = settings.uiLanguage === "en";
  const t = (zh: string, english: string) => en ? english : zh;

  return <main className="popup">
    <header><span className="mark">译</span><div><h1>{t("流译助手", "Flow Translate")}</h1><p>{saved ? t("已保存", "Saved") : t("快速选择翻译参数", "Quick translation settings")}</p></div></header>
    {!settings.privacyConsentAccepted && <section className="consent"><strong>{t("翻译前请确认", "Before translating")}</strong><p>{t("你选择或输入的文字将发送到你配置的模型服务。请勿发送密码、支付、医疗等敏感信息。历史记录默认关闭。", "Selected or entered text is sent to your configured model service. Do not send passwords, payment, health, or other sensitive data. History is off by default.")}</p><button onClick={() => update({ privacyConsentAccepted: true })}>{t("了解并同意", "Understand and agree")}</button></section>}
    <div className="language-direction">
      <label>{t("源语言", "Source")}
        <select disabled={!ready} value={settings.sourceLanguage} onChange={(event) => update({ sourceLanguage: event.target.value })}>
          {SOURCE_LANGUAGES.map((language) => <option key={language} value={language}>{en && language === "自动检测" ? "Auto-detect" : language}</option>)}
        </select>
      </label>
      <span className="direction-arrow" aria-hidden="true">→</span>
      <label>{t("目标语言", "Target")}
        <select disabled={!ready} value={settings.targetLanguage} onChange={(event) => update({ targetLanguage: event.target.value })}>
          {LANGUAGES.map((language) => <option key={language}>{language}</option>)}
        </select>
      </label>
    </div>
    <label>{t("翻译模型", "Model")}
      <select disabled={!ready} value={settings.activeModelId} onChange={(event) => update({ activeModelId: event.target.value })}>
        {enabledProfiles.map((profile) => (
          <option key={profile.id} value={profile.id}>{profile.name} · {profile.model || t("未配置", "Not configured")}</option>
        ))}
      </select>
    </label>
    <label>{t("翻译场景", "Scene")}
      <select disabled={!ready} value={settings.translationScene} onChange={(event) => update({ translationScene: event.target.value as TranslatorSettings["translationScene"] })}>
        {TRANSLATION_SCENES.map((scene) => <option key={scene.id} value={scene.id}>{en ? ({ general: "General", technical: "Technical", academic: "Academic", business: "Business" }[scene.id]) : scene.name}</option>)}
      </select>
    </label>
    <footer><span>{t("选择网页文字后点击圆点", "Select text, then click the dot")}</span><div><button title={t("打开长文本翻译", "Open long text translator")} onClick={openSidePanel}>{t("长文本", "Long text")}</button><button title={t("打开完整设置", "Open settings")} aria-label={t("打开完整设置", "Open settings")} onClick={openSettings}>⚙</button></div></footer>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
