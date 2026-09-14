import { settingsForFeature } from "../../core/translation/model-routing";
import { isMachine } from "../../core/services/capabilities";
import { watchSettings } from "../../shared/settings";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { getSettings, saveSettings } from "../../shared/settings";
import { DEFAULT_SETTINGS, TRANSLATION_SCENES, type ServerMessage, type TranslatorSettings } from "../../shared/types";
import "./style.css";

const LANGUAGES = ["简体中文", "繁體中文", "English", "日本語", "한국어", "Français", "Deutsch", "Español"];

function App() {
  const [settings, setSettings] = useState<TranslatorSettings>(DEFAULT_SETTINGS);
  const [actualTarget, setActualTarget] = useState("");
  const [source, setSource] = useState("");
  const [result, setResult] = useState("");
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);
  const portRef = useRef<ReturnType<typeof browser.runtime.connect> | null>(null);
  const requestRef = useRef<string | null>(null);
  const effective = settingsForFeature(settings, "longText");
  const modelAssigned = settings.separateModels && Boolean(settings.featureModels.longText);
  const en = settings.uiLanguage === "en";
  const t = (zh: string, english: string) => en ? english : zh;

  useEffect(() => watchSettings(setSettings), []);
  useEffect(() => { void getSettings().then(setSettings); return () => portRef.current?.disconnect(); }, []);
  useEffect(() => { document.title = settings.uiLanguage === "en" ? "Long Text Translation" : "长文本翻译"; }, [settings.uiLanguage]);
  async function update(patch: Partial<TranslatorSettings>) {
    const next = { ...settings, ...patch }; setSettings(next); await saveSettings(next);
  }
  function cancel() {
    try {
      if (requestRef.current) portRef.current?.postMessage({ type: "cancel", requestId: requestRef.current });
    } catch { /* The service worker already dropped the port. */ }
    portRef.current?.disconnect(); portRef.current = null; requestRef.current = null;
    setRunning(false); setStatus(t("已取消", "Cancelled"));
  }
  function translate(refresh = false, target?: string) {
    if (!settings.privacyConsentAccepted) { setStatus(t("请先在插件弹窗或设置中确认数据处理说明", "Accept the data handling notice in the popup or settings first")); return; }
    if (!source.trim() || running) return;
    setResult(""); setRunning(true); setStatus(t("正在连接模型…", "Connecting to model…"));
    const requestId = crypto.randomUUID(); requestRef.current = requestId;
    const port = browser.runtime.connect({ name: "translation-stream" }); portRef.current = port;
    let settled = false;
    port.onMessage.addListener((message: ServerMessage) => {
      if (message.requestId !== requestId || requestRef.current !== requestId) return;
      if (message.type === "start") { setActualTarget(message.targetLanguage ?? ""); setStatus(t("正在翻译…", "Translating…")); }
      if (message.type === "retry") { setResult(""); setStatus(t("正在重新连接模型…", "Reconnecting to model…")); }
      if (message.type === "delta") setResult((value) => value + message.text);
      if (message.type === "finish") {
        settled = true; requestRef.current = null; setRunning(false);
        setStatus(message.cached ? t("已从缓存完成", "Completed from cache") : t("翻译完成", "Translation complete"));
        port.disconnect(); if (portRef.current === port) portRef.current = null;
      }
      if (message.type === "error") {
        settled = true; requestRef.current = null; setRunning(false); setStatus(message.message);
        port.disconnect(); if (portRef.current === port) portRef.current = null;
      }
    });
    port.onDisconnect.addListener(() => {
      if (settled) return;
      requestRef.current = null;
      if (portRef.current === port) portRef.current = null;
      setRunning(false);
      setStatus(t("与翻译后台的连接已断开，请重试", "The translation service disconnected. Please try again."));
    });
    port.postMessage({ type: "translate", requestId, text: source, refresh, target, pageTitle: t("Side Panel 长文本翻译", "Side Panel translation") });
  }

  const profiles = settings.modelProfiles.filter((profile) => profile.enabled);
  return <main><header><div><span>译</span><div><h1>{t("长文本翻译", "Long text translation")}</h1><p>{t("适合段落、文章与较长内容", "For paragraphs, articles, and long content")}</p></div></div><button onClick={() => browser.tabs.create({ url: browser.runtime.getURL("/options.html") })} title={t("设置", "Settings")}>⚙</button></header>
    {!settings.privacyConsentAccepted && <section className="privacy-note">{t("翻译内容会发送到你配置的模型服务。请先在插件弹窗或设置页阅读并同意数据处理说明。", "Translation text is sent to your configured model service. Review and accept the data handling notice in the popup or settings first.")}</section>}
    {settings.bidirectional && <p>{t("双向互译：", "Bidirectional: ")}{settings.pairSourceLanguage} ↔ {settings.pairLanguage}</p>}
    <section className="selectors">
      <label>{t("目标语言", "Target language")}<select disabled={settings.bidirectional} value={settings.targetLanguage} onChange={(e) => update({ targetLanguage: e.target.value })}>{LANGUAGES.map(x => <option key={x}>{x}</option>)}</select></label>
      <label>{t("翻译模型", "Model")}<select disabled={modelAssigned} title={modelAssigned ? t("此功能的模型已在设置中指定", "This feature’s model is assigned in settings") : undefined} value={effective.activeModelId} onChange={(e) => update({ activeModelId: e.target.value })}>{profiles.map(x => <option value={x.id} key={x.id}>{x.name}</option>)}</select></label>
      <label>{t("翻译场景", "Scene")}<select disabled={isMachine(effective.provider)} value={settings.translationScene} onChange={(e) => update({ translationScene: e.target.value as TranslatorSettings["translationScene"] })}>{TRANSLATION_SCENES.map(x => <option value={x.id} key={x.id}>{en ? ({general:"General",technical:"Technical",academic:"Academic",business:"Business"}[x.id]) : x.name}</option>)}</select></label>
    </section>
    <section className="box source"><div><strong>{t("原文", "Source")}</strong><small>{source.length} / 100,000</small></div><textarea value={source} maxLength={100_000} onChange={(e) => setSource(e.target.value)} placeholder={t("粘贴或输入需要翻译的长文本…", "Paste or type text to translate…")} /></section>
    <div className="actions"><button className="primary" disabled={!settings.privacyConsentAccepted || !source.trim() || running} onClick={() => translate()}>{running ? t("翻译中…", "Translating…") : t("开始翻译", "Translate")}</button>{running && <button onClick={cancel}>{t("取消", "Cancel")}</button>}<button disabled={running || !source.trim()} onClick={()=>translate(true)}>{t("重新翻译", "Translate again")}</button>{settings.bidirectional && <button disabled={running || !source.trim()} onClick={()=>translate(true,actualTarget===settings.pairLanguage?settings.pairSourceLanguage:settings.pairLanguage)}>{t("切换方向", "Switch direction")}</button>}<span>{status} {actualTarget && `→ ${actualTarget}`}</span></div>
    <section className="box result"><div><strong>{t("译文", "Translation")}</strong><button disabled={!result} onClick={() => navigator.clipboard.writeText(result)}>{t("复制", "Copy")}</button></div><div className="output">{result || <em>{t("译文将在此处流式显示", "Translation will stream here")}</em>}</div></section>
  </main>;
}
createRoot(document.getElementById("root")!).render(<App />);
