import { useSaveFeedback } from "../../shared/useSaveFeedback";
import { selectFeatureService, updateFeaturePreferences } from "../../shared/service-selection";
import { FeatureServiceSelect } from "../../shared/FeatureServiceSelect";
import { usePrivacyNotice, confirmPrivacyConsent } from "../../shared/privacy-notices";
import { LanguageDirection } from "../../shared/LanguageDirection";
import { PageControls } from "./PageControls";
import { featurePreferencesPatch, settingsForFeature } from "../../core/translation/model-routing";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { getSettings, patchSettings, watchSettings } from "../../shared/settings";
import type { FeatureTranslationPreferences, TranslatorSettings, TranslationFeature } from "../../shared/types";
import { DEFAULT_SETTINGS } from "../../shared/types";
import "./style.css";


function App() {
  const privacyNotice = usePrivacyNotice("popup");
  const [confirmingPrivacy, setConfirmingPrivacy] = useState(false);
  const [privacyError, setPrivacyError] = useState("");
  async function confirmPrivacy() {
    setConfirmingPrivacy(true); setPrivacyError("");
    try {
      // watchSettings refreshes the local settings when the consent flag lands.
      await confirmPrivacyConsent("popup");
    } catch {
      setPrivacyError(t("确认未保存，请重试。", "Confirmation was not saved. Please retry."));
    } finally { setConfirmingPrivacy(false); }
  }
  useEffect(() => {
    if (!privacyError) return;
    const timer = setTimeout(() => setPrivacyError(""), 4000);
    return () => clearTimeout(timer);
  }, [privacyError]);

  const [settings, setSettings] = useState<TranslatorSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const { saving, notice: saveNotice, run: save } = useSaveFeedback(settings.uiLanguage === "en");
  useEffect(() => watchSettings(setSettings), []);

  useEffect(() => {
    getSettings().then((value) => { setSettings(value); setReady(true); });
  }, []);
  useEffect(() => { document.title = settings.uiLanguage === "en" ? "Flow Translate" : "流译助手"; }, [settings.uiLanguage]);

  async function update(patch: Partial<TranslatorSettings>, feature?: TranslationFeature, id = "") {
    if (!feature) setSettings(current => ({ ...current, ...patch }));
    await save(async () => {
      try { setSettings(await (feature ? selectFeatureService(feature, id) : patchSettings(patch))); }
      catch (error) { try { setSettings(await getSettings()); } catch { /* Keep the visible draft for retry. */ } throw error; }
    });
  }
  async function updateSelectionPreferences(patch: Partial<FeatureTranslationPreferences>) {
    setSettings(current => ({ ...current, ...featurePreferencesPatch(current, "selection", patch) }));
    await save(async () => setSettings(await updateFeaturePreferences("selection", patch)));
  }

  function openSettings() {
    browser.tabs.create({ url: browser.runtime.getURL("/options.html") });
    window.close();
  }

  async function openSidePanel() {
    await browser.sidePanel.open({ windowId: browser.windows.WINDOW_ID_CURRENT });
    window.close();
  }

  const en = settings.uiLanguage === "en";
  const t = (zh: string, english: string) => en ? english : zh;
  const selectionSettings = settingsForFeature(settings, "selection");

  return <main className="popup">
    <header><img className="mark" src="/icon/128.png" width="40" height="40" alt="" aria-hidden="true" /><div><h1>{t("流译助手", "Flow Translate")}</h1><p>{saving ? t("正在保存…", "Saving…") : saveNotice?.text || t("快速选择翻译参数", "Quick translation settings")}</p></div></header>
    {privacyNotice.accepted === false && <section className="consent"><strong>{t("翻译前请确认", "Before translating")}</strong><p>{t("你选择、输入或通过全文翻译提交的文字将发送到当前服务；自动全文模式会在进入符合规则的页面时发送正文。请勿发送密码、支付、医疗等敏感信息。历史记录默认关闭。", "Selected, entered or page-translation text is sent to your configured service. Automatic page mode sends readable text when entering eligible pages. Do not send passwords, payment, health, or other sensitive data. History is off by default.")}</p><button disabled={!ready || confirmingPrivacy} onClick={confirmPrivacy}>{t("了解并同意", "Understand and agree")}</button></section>}
    {privacyError && <p role="alert">{privacyError}</p>}
    <LanguageDirection settings={selectionSettings} update={updateSelectionPreferences} disabled={!ready || saving} />
    <FeatureServiceSelect settings={settings} feature="selection" label={t("划词翻译服务", "Selection translation service")} disabled={!ready || saving} onChange={id => { void update({}, "selection", id); }} />
    <PageControls settings={settings} update={update} saving={saving || !ready} />
    <footer><span>{t("选择网页文字后点击圆点", "Select text, then click the dot")}</span><div><button title={t("打开长文本翻译", "Open long text translator")} onClick={openSidePanel}>{t("长文本", "Long text")}</button><button title={t("打开完整设置", "Open settings")} aria-label={t("打开完整设置", "Open settings")} onClick={openSettings}>⚙</button></div></footer>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
