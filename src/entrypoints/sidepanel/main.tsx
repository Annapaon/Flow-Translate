import { useSaveFeedback } from "../../ui/hooks/useSaveFeedback";
import { selectFeatureService, updateFeaturePreferences } from "../../shared/service-selection";
import { capabilitiesForFeature } from "../../core/services/capabilities";
import { featurePreferencesPatch, settingsForFeature } from "../../core/translation/model-routing";
import { watchSettings } from "../../shared/settings";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { getSettings, patchSettings } from "../../shared/settings";
import { DEFAULT_SETTINGS, type FeatureTranslationPreferences, type ServerMessage, type TranslatorSettings } from "../../shared/types";
import "./style.css";

const LANGUAGES = ["简体中文", "繁體中文", "English", "日本語", "한국어", "Français", "Deutsch", "Español"];

function App() {
  const [settings, setSettings] = useState<TranslatorSettings>(DEFAULT_SETTINGS);
  const [source, setSource] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const { saving, notice: saveNotice, run: save } = useSaveFeedback(settings.uiLanguage === "en");
  const portRef = useRef<ReturnType<typeof browser.runtime.connect> | null>(null);
  const requestRef = useRef<string | null>(null);
  const en = settings.uiLanguage === "en";
  const t = (zh: string, english: string) => en ? english : zh;

  useEffect(() => watchSettings(setSettings), []);
  useEffect(() => { void getSettings().then(setSettings); return () => portRef.current?.disconnect(); }, []);
  useEffect(() => { document.title = settings.uiLanguage === "en" ? "Long Text Translation" : "长文本翻译"; }, [settings.uiLanguage]);
  async function update(patch: Partial<TranslatorSettings>, modelId?: string) {
    await save(async () => {
      setSettings(await (modelId === undefined ? patchSettings(patch) : selectFeatureService("longText", modelId)));
    });
  }
  async function updatePreferences(patch: Partial<FeatureTranslationPreferences>) {
    setSettings(current => ({ ...current, ...featurePreferencesPatch(current, "longText", patch) }));
    await save(async () => setSettings(await updateFeaturePreferences("longText", patch)));
  }

  function cancel() {
    try {
      if (requestRef.current) portRef.current?.postMessage({ type: "cancel", requestId: requestRef.current });
    } catch { /* The service worker already dropped the port. */ }
    portRef.current?.disconnect(); portRef.current = null; requestRef.current = null;
    setRunning(false); setError("");
  }
  function translate(refresh = false, target?: string) {
    if (!settings.privacyConsentAccepted) { setError(t("请先在插件弹窗或设置中确认数据处理说明", "Accept the data handling notice in the popup or settings first")); return; }
    if (!source.trim() || running || saving) return;
    setResult(""); setError(""); setRunning(true);
    const requestId = crypto.randomUUID(); requestRef.current = requestId;
    const port = browser.runtime.connect({ name: "long-text-translation" }); portRef.current = port;
    let settled = false;
    port.onMessage.addListener((message: ServerMessage) => {
      if (message.requestId !== requestId || requestRef.current !== requestId) return;
      if (message.type === "retry") setResult("");
      if (message.type === "delta") setResult((value) => value + message.text);
      if (message.type === "finish") {
        settled = true; requestRef.current = null; setRunning(false);
        port.disconnect(); if (portRef.current === port) portRef.current = null;
      }
      if (message.type === "error") {
        settled = true; requestRef.current = null; setRunning(false); setError(message.message);
        port.disconnect(); if (portRef.current === port) portRef.current = null;
      }
    });
    port.onDisconnect.addListener(() => {
      if (settled) return;
      requestRef.current = null;
      if (portRef.current === port) portRef.current = null;
      setRunning(false);
      setError(t("与翻译后台的连接已断开，请重试", "The translation service disconnected. Please try again."));
    });
    port.postMessage({ type: "translate", requestId, text: source, refresh, target, pageTitle: t("Side Panel 长文本翻译", "Side Panel translation") });
  }

  const profiles = settings.modelProfiles.filter((profile) => profile.enabled);
  const effective = settingsForFeature(settings, "longText");
  return <main><header><div><span>译</span><div><h1>{t("长文本翻译", "Long text translation")}</h1><p>{t("适合段落、文章与较长内容", "For paragraphs, articles, and long content")}</p></div></div><button onClick={() => browser.tabs.create({ url: browser.runtime.getURL("/options.html") })} title={t("设置", "Settings")}>⚙</button></header>
    {!settings.privacyConsentAccepted && <section className="privacy-note">{t("翻译内容会发送到你配置的模型服务。请先在插件弹窗或设置页阅读并同意数据处理说明。", "Translation text is sent to your configured model service. Review and accept the data handling notice in the popup or settings first.")}</section>}
    <section className="selectors">
      <label>{t("目标语言", "Target language")}<select disabled={running || saving} value={effective.targetLanguage} onChange={(e) => updatePreferences({ targetLanguage: e.target.value })}>{LANGUAGES.map(x => <option key={x}>{x}</option>)}</select></label>
      <label>{t("翻译模型", "Model")}<select aria-label={t("翻译模型", "Model")} disabled={running || saving} value={settings.featureModels.longText} onChange={(e) => update({}, e.target.value)}>
        <option value="">{t("跟随默认模型", "Follow default model")}（{profiles.find(p => p.id === settings.activeModelId)?.name}）</option>
        {profiles.map(x => <option value={x.id} key={x.id}>{x.name}</option>)}
      </select><small>{t("切换只修改长文本翻译的服务。", "Switching changes only the long text translation service.")}</small></label>
      {capabilitiesForFeature(settings, "longText").richOutput && <label>{t("翻译场景", "Scene")}<select disabled={running || saving} value={effective.translationScene} onChange={(e) => updatePreferences({ translationScene: e.target.value })}>{settings.promptStyles.map(style => <option value={style.id} key={style.id}>{style.name}</option>)}</select></label>}
    </section>
    {!capabilitiesForFeature(settings, "longText").richOutput && <p>{t("当前长文本服务仅支持纯翻译。", "The long text service supports translation only.")}</p>}
    {(saving || saveNotice) && <p role={saveNotice?.error ? "alert" : "status"}>{saving ? t("正在保存…", "Saving…") : saveNotice?.text}</p>}
    <section className="box source"><div><strong>{t("原文", "Source")}</strong><small>{source.length} / 100,000</small></div><textarea value={source} maxLength={100_000} onChange={(e) => setSource(e.target.value)} placeholder={t("粘贴或输入需要翻译的长文本…", "Paste or type text to translate…")} /></section>
    <div className="actions"><button className="primary" disabled={!settings.privacyConsentAccepted || !source.trim() || running || saving} onClick={() => translate()}>{running ? t("翻译中…", "Translating…") : t("开始翻译", "Translate")}</button>{running && <button onClick={cancel}>{t("取消", "Cancel")}</button>}<button disabled={running || saving || !source.trim()} onClick={()=>translate(true)}>{t("重新翻译", "Translate again")}</button></div>
    {error && <p className="translation-error" role="alert">{error}</p>}
    <section className="box result"><div><strong>{t("译文", "Translation")}</strong><button disabled={!result} onClick={() => navigator.clipboard.writeText(result)}>{t("复制", "Copy")}</button></div><div className="output">{result || <em>{t("译文将在此处流式显示", "Translation will stream here")}</em>}</div></section>
  </main>;
}
createRoot(document.getElementById("root")!).render(<App />);
