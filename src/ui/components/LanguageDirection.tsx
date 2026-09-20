import React from "react";
import type { TranslatorSettings } from "../../shared/types";
import { LANGUAGE_NAMES } from "../../core/translation/language";
import "../styles/translation-controls.css";

export function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return <label className="ft-toggle"><span>{label}</span><input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} /><span className="ft-toggle-track" aria-hidden="true" /></label>;
}

export function LanguageDirection({ settings: s, update, disabled = false, allowBidirectional = true }: { settings: TranslatorSettings; update: (patch: Partial<TranslatorSettings>) => void; disabled?: boolean; allowBidirectional?: boolean }) {
  const en = s.uiLanguage === "en";
  const t = (zh: string, english: string) => en ? english : zh;
  return <div className="ft-direction">
    {allowBidirectional && <Toggle label={t("双向互译", "Bidirectional translation")} checked={s.bidirectional} disabled={disabled} onChange={bidirectional => update({ bidirectional })} />}
    <div className="ft-language-grid">
      {allowBidirectional && s.bidirectional ? <>
        <label>{t("互译语言一", "First language")}<select disabled={disabled} value={s.pairSourceLanguage} onChange={e => update({ pairSourceLanguage: e.target.value })}>{LANGUAGE_NAMES.map(name => <option key={name} disabled={name === s.pairLanguage}>{name}</option>)}</select></label>
        <span className="ft-direction-arrow" aria-hidden="true">↔</span>
        <label>{t("互译语言二", "Second language")}<select disabled={disabled} value={s.pairLanguage} onChange={e => update({ pairLanguage: e.target.value })}>{LANGUAGE_NAMES.map(name => <option key={name} disabled={name === s.pairSourceLanguage}>{name}</option>)}</select></label>
      </> : <>
        <label>{t("源语言", "Source language")}<select disabled={disabled} value={s.sourceLanguage} onChange={e => update({ sourceLanguage: e.target.value })}>{["自动检测", ...LANGUAGE_NAMES].map(name => <option key={name} value={name}>{en && name === "自动检测" ? "Auto-detect" : name}</option>)}</select></label>
        <span className="ft-direction-arrow" aria-hidden="true">→</span>
        <label>{t("目标语言", "Target language")}<select disabled={disabled} value={s.targetLanguage} onChange={e => update({ targetLanguage: e.target.value })}>{LANGUAGE_NAMES.map(name => <option key={name}>{name}</option>)}</select></label>
      </>}
    </div>
    {allowBidirectional && s.bidirectional && <p className="ft-help">{t("自动识别两种语言并互译；其他语言译为语言一。", "Automatically translates between both languages; other languages translate to the first.")}</p>}
  </div>;
}
