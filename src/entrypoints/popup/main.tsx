import { useSaveFeedback } from "../../shared/useSaveFeedback";
import { selectFeatureService } from "../../shared/service-selection";
import { FeatureServiceSelect } from "../../shared/FeatureServiceSelect";
import { usePrivacyNotice, confirmPrivacyConsent } from "../../shared/privacy-notices";
import { LanguageDirection } from "../../shared/LanguageDirection";
import { PageControls } from "./PageControls";
import { capabilitiesForFeature } from "../../core/services/capabilities";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { getSettings, patchSettings, watchSettings } from "../../shared/settings";
import type { TranslatorSettings, TranslationFeature } from "../../shared/types";
import { DEFAULT_SETTINGS, TRANSLATION_SCENES } from "../../shared/types";
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

  return <main className="popup">
    <header><span className="mark">译</span><div><h1>{t("流译助手", "Flow Translate")}</h1><p>{saving ? t("正在保存…", "Saving…") : saveNotice?.text || t("快速选择翻译参数", "Quick translation settings")}</p></div></header>
    {privacyNotice.accepted === false && <section className="consent"><strong>{t("翻译前请确认", "Before translating")}</strong><p>{t("你选择、输入或通过全文翻译提交的文字将发送到当前服务；自动全文模式会在进入符合规则的页面时发送正文。请勿发送密码、支付、医疗等敏感信息。历史记录默认关闭。", "Selected, entered or page-translation text is sent to your configured service. Automatic page mode sends readable text when entering eligible pages. Do not send passwords, payment, health, or other sensitive data. History is off by default.")}</p><button disabled={!ready || confirmingPrivacy} onClick={confirmPrivacy}>{t("了解并同意", "Understand and agree")}</button></section>}
    {privacyError && <p role="alert">{privacyError}</p>}
    <LanguageDirection settings={settings} update={update} disabled={!ready || saving} />
    <FeatureServiceSelect settings={settings} feature="selection" label={t("翻译服务", "Translation service")} disabled={!ready || saving} onChange={id => { void update({}, "selection", id); }} />
    <p className="ft-help">{settings.separateModels ? t("切换仅修改划词翻译的服务。", "Switching changes only the selection service.") : t("所有翻译功能共用此默认服务。", "All translation features share this default service.")}</p>
    {capabilitiesForFeature(settings, "selection").richOutput ? <label>{t("翻译场景", "Scene")}
      <select disabled={!ready || saving} value={settings.translationScene} onChange={(event) => update({ translationScene: event.target.value as TranslatorSettings["translationScene"] })}>
        {TRANSLATION_SCENES.map((scene) => <option key={scene.id} value={scene.id}>{en ? ({ general: "General", technical: "Technical", academic: "Academic", business: "Business" }[scene.id]) : scene.name}</option>)}
      </select>
    </label> : <p className="ft-help">{t("当前划词服务仅支持纯翻译。", "The selection service supports translation only.")}</p>}
    <PageControls settings={settings} update={update} saving={saving || !ready} onServiceChange={id => { void update({}, "page", id); }} />
    <footer><span>{t("选择网页文字后点击圆点", "Select text, then click the dot")}</span><div><button title={t("打开长文本翻译", "Open long text translator")} onClick={openSidePanel}>{t("长文本", "Long text")}</button><button title={t("打开完整设置", "Open settings")} aria-label={t("打开完整设置", "Open settings")} onClick={openSettings}>⚙</button></div></footer>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
