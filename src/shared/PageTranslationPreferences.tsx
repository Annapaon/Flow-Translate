import React, { useEffect, useState } from "react";
import type { TranslatorSettings } from "./types";
import { Toggle } from "./LanguageDirection";

export function PageTranslationPreferences({ settings: s, update, onTranslate, translateDisabled = false }: {
  settings: TranslatorSettings;
  update: (patch: Partial<TranslatorSettings>) => void;
  onTranslate?: () => Promise<void>;
  translateDisabled?: boolean;
}) {
  const t = (zh: string, en: string) => s.uiLanguage === "en" ? en : zh;
  const [shortcut, setShortcut] = useState<string | undefined>();
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = () => { void browser.commands.getAll().then(commands => {
      if (alive) setShortcut(commands.find(command => command.name === "translate-page")?.shortcut ?? "");
    }).catch(() => { if (alive) setShortcut(""); }); };
    refresh();
    window.addEventListener("focus", refresh);
    return () => { alive = false; window.removeEventListener("focus", refresh); };
  }, []);
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(""), 4_000);
    return () => clearTimeout(timer);
  }, [error]);
  return <div className="ft-page-preferences">
    <Toggle label={t("网页全文翻译", "Page translation")} checked={s.pageTranslationEnabled} onChange={pageTranslationEnabled => update({ pageTranslationEnabled })} />
    {s.pageTranslationEnabled && <>
      <div className="ft-mode-buttons" role="group" aria-label={t("全文翻译模式", "Page translation mode")}>
        <button type="button" aria-pressed={s.pageTranslationMode === "manual"} onClick={() => update({ pageTranslationMode: "manual" })}>{t("按键翻译", "Key translation")}</button>
        <button type="button" aria-pressed={s.pageTranslationMode === "auto"} onClick={() => update({ pageTranslationMode: "auto" })}>{t("自动翻译", "Automatic translation")}</button>
      </div>
      {s.pageTranslationMode === "manual" ? <div className="ft-shortcut">
        {onTranslate ? <button type="button" className="ft-translate-button" disabled={translateDisabled || starting} onClick={async () => {
          setStarting(true); setError("");
          try { await onTranslate(); }
          catch (error) { setError(error instanceof Error ? error.message : t("无法开始翻译，请刷新网页后重试。", "Unable to start translation. Refresh the page and retry.")); }
          finally { setStarting(false); }
        }}>{starting ? t("正在开始…", "Starting…") : t("点击翻译", "Click to translate")}（{shortcut === undefined ? "…" : shortcut ? shortcut.replace(/\s*\+\s*/g, " + ") : t("未绑定快捷键", "No shortcut assigned")}）</button>
          : <span className="ft-shortcut-label">{t("翻译快捷键", "Translation shortcut")} · {shortcut === undefined ? "…" : shortcut || t("未绑定", "Not assigned")}</span>}
        <button type="button" onClick={() => { void browser.tabs.create({ url: "chrome://extensions/shortcuts" }).catch(() => setError(t("请在浏览器扩展快捷键页面修改。", "Open your browser's extension shortcuts page to change this shortcut."))); }}>{t("修改快捷键", "Change shortcut")}</button>
      </div> : <p className="ft-help">{t("进入可翻译页面后自动发送正文，译文显示在原文下方；已暂停或禁用的网站除外。", "Automatically sends readable text when you enter a page and displays translations below it, except on paused or blocked sites.")}</p>}
    </>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
