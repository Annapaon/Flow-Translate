import React from "react";
import { LanguageDirection } from "../../../shared/LanguageDirection";
import { PageTranslationPreferences } from "../../../shared/PageTranslationPreferences";
import { ReadingPreferences } from "../../../shared/ReadingPreferences";
import { TranslationPreferences } from "../../../shared/TranslationPreferences";
import { capabilitiesForFeature } from "../../../core/services/capabilities";
import { TRANSLATION_SCENES, type TranslationScene, type TranslatorSettings } from "../../../shared/types";
export function TranslationSettings({ form, update, patch }: {
  form: TranslatorSettings;
  update: <K extends keyof TranslatorSettings>(key: K, value: TranslatorSettings[K]) => void;
  patch: (patch: Partial<TranslatorSettings>) => void;
}) {
  const en = form.uiLanguage === "en";
  const t = (zh: string, english: string) => en ? english : zh;
  const llmFeatures = (["selection", "longText", "page"] as const).filter(feature => capabilitiesForFeature(form, feature).richOutput);
  const showOutputPreferences = llmFeatures.length === 0 || llmFeatures.some(feature => feature !== "page");
  return <section className="card">
        <div className="section-head"><div><span className="step">02</span><h2>{t("翻译配置", "Translation settings")}</h2><p>{t("设置翻译语言、触发行为和输出方式。", "Configure languages, trigger behavior, and output.")}</p></div></div>
        <LanguageDirection settings={form} update={patch} />
        <div className="grid">
          <label>{t("触发方式", "Trigger mode")}<select value={form.triggerMode} onChange={(event) => update("triggerMode", event.target.value as "click" | "auto")}><option value="click">{t("点击圆点翻译", "Click the dot")}</option><option value="auto">{t("选择后自动翻译", "Translate automatically")}</option></select></label>
          <label>{t("选区字符范围", "Selection length")}<div className="range"><input type="number" min="1" max="100" value={form.minChars} onChange={(event) => update("minChars", Number(event.target.value))} /><span>{t("至", "to")}</span><input type="number" min="100" max="20000" value={form.maxChars} onChange={(event) => update("maxChars", Number(event.target.value))} /></div></label>
        </div>
        <PageTranslationPreferences settings={form} update={patch} />
        <ReadingPreferences settings={form} update={patch} />
        <details className="llm-preferences" key={llmFeatures.join(",")} open={llmFeatures.length > 0}>
          <summary>{t("大模型专属设置", "LLM preferences")}</summary>
          {llmFeatures.length === 0 && <p className="standalone-notice">{t("当前各功能均使用普通翻译服务。可展开预先配置，切换到大模型后生效。", "All features currently use translation services. Expand to save preferences for later LLM use.")}</p>}
          <p className="ft-help">{t("智能输出、输出模式和思考过程仅用于划词与长文本；全文始终只输出译文。设置在切换服务时保留。", "Smart output, output mode and reasoning apply to selection and long text only. Page translation always outputs translations only. Switching services preserves preferences.")}</p>
          {showOutputPreferences && <div className="grid">
          <label>{t("思考过程", "Reasoning")}<select value={form.enableThinking ? "on" : "off"} onChange={(event) => update("enableThinking", event.target.value === "on")}><option value="off">{t("关闭（默认）", "Off (default)")}</option><option value="on">{t("开启并显示", "On and visible")}</option></select></label>
          <label>{t("输出模式", "Output mode")}<select value={form.outputMode} onChange={(event) => update("outputMode", event.target.value as TranslatorSettings["outputMode"])}><option value="translation">{t("仅输出译文", "Translation only")}</option><option value="explanation">{t("译文与表达解释", "Translation and explanation")}</option><option value="vocabulary">{t("译文与重点词汇", "Translation and vocabulary")}</option><option value="grammar">{t("译文与语法说明", "Translation and grammar")}</option></select></label>
          </div>}
          <label>{t("翻译场景", "Scene")}<select value={form.translationScene} onChange={event => update("translationScene", event.target.value as TranslationScene)}>{TRANSLATION_SCENES.map(scene => <option key={scene.id} value={scene.id}>{en ? ({ general: "General", technical: "Technical", academic: "Academic", business: "Business" }[scene.id]) : scene.name}</option>)}</select></label>
          <TranslationPreferences showSmartOutput={showOutputPreferences} settings={form} update={patch} />
        </details>
      </section>;
}
