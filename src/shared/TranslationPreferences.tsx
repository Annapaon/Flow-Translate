import React from "react";
import type { TranslatorSettings, TermEntry } from "./types";
import { LANGUAGE_NAMES } from "../core/translation/language";
import { isMachine } from "../core/services/capabilities";
import { Toggle } from "./LanguageDirection";
export function TranslationPreferences({ settings: s, update }: {
  settings: TranslatorSettings;
  update: (patch: Partial<TranslatorSettings>) => void;
}) {
  const t = (zh: string, english: string) => s.uiLanguage === "en" ? english : zh;
  const machine = isMachine(s.modelProfiles.find(p => p.id === s.activeModelId)?.provider ?? s.provider);
  const edit = (index: number, patch: Partial<TermEntry>) => update({ terms: s.terms.map((term, i) => i === index ? { ...term, ...patch } : term) });
  return <div className="translation-preferences">
    <Toggle label={t("智能输出", "Smart output")} checked={s.smartOutput} disabled={machine} onChange={smartOutput => update({ smartOutput })} />
    <p className="ft-help">{t("根据文本自动选择单词释义、短语解释或句子翻译。", "Automatically chooses word meanings, phrase explanations or sentence translation.")}</p>
    {machine && <p className="standalone-notice">{t("此服务仅支持纯翻译。智能输出、提示词、思考过程和术语设置将在切换到大模型时生效。", "This service supports translation only. Smart output, prompts, reasoning and terms apply when you switch to an LLM.")}</p>}
    <details className="ft-terms">
      <summary>{t("自定义术语", "Custom terms")} · {s.terms.length}/100</summary>
      {s.terms.map((term, i) => <div className="ft-term" key={i}>
        <label>{t("源词", "Source term")}<input value={term.source} maxLength={200} placeholder={t("输入原文术语", "Enter source term")} onChange={e => edit(i, { source: e.target.value })} /></label>
        <label>{t("译词", "Target term")}<input value={term.target} maxLength={300} disabled={term.preserve} placeholder={t("输入指定译法", "Enter preferred translation")} onChange={e => edit(i, { target: e.target.value })} /></label>
        <label>{t("术语源语言", "Term source language")}<select value={term.sourceLanguage} onChange={e => edit(i, { sourceLanguage: e.target.value })}>{["auto", ...LANGUAGE_NAMES].map(name => <option key={name} value={name}>{name === "auto" ? t("自动检测", "Auto-detect") : name}</option>)}</select></label>
        <label>{t("术语目标语言", "Term target language")}<select value={term.targetLanguage} onChange={e => edit(i, { targetLanguage: e.target.value })}>{LANGUAGE_NAMES.map(name => <option key={name}>{name}</option>)}</select></label>
        <Toggle label={t("保留原文", "Keep original")} checked={term.preserve} onChange={preserve => edit(i, { preserve })} />
        <button type="button" onClick={() => update({ terms: s.terms.filter((_, j) => j !== i) })}>{t("删除", "Delete")}</button>
      </div>)}
      <button type="button" disabled={s.terms.length >= 100} onClick={() => update({ terms: [...s.terms, { source: "", target: "", sourceLanguage: "auto", targetLanguage: s.bidirectional ? s.pairLanguage : s.targetLanguage, preserve: false }] })}>＋ {t("添加术语", "Add term")}</button>
      <small>{t("仅大模型使用命中的术语；语言方向独立，不自动反转。", "Only matching terms are sent to LLMs. Terms apply in the specified direction.")}</small>
    </details>
  </div>;
}
