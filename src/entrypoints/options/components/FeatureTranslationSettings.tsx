import React from "react";
import { capabilitiesForFeature } from "../../../core/services/capabilities";
import { featurePreferencesPatch, serviceSelectionPatch, settingsForFeature } from "../../../core/translation/model-routing";
import { FeatureServiceSelect } from "../../../shared/FeatureServiceSelect";
import { LanguageDirection, Toggle } from "../../../shared/LanguageDirection";
import { PageTranslationPreferences } from "../../../shared/PageTranslationPreferences";
import { ReadingPreferences } from "../../../shared/ReadingPreferences";
import { TranslationPreferences } from "../../../shared/TranslationPreferences";
import { TRANSLATION_SCENES, type FeatureTranslationPreferences, type TranslationFeature, type TranslatorSettings } from "../../../shared/types";

const TITLES: Record<TranslationFeature, [string, string, string, string]> = {
  selection: ["划词翻译", "Selection translation", "设置划词时使用的服务、提示词和交互行为。", "Choose the service, prompt, and interaction used for selections."],
  page: ["全文翻译", "Page translation", "设置全文与指定区域翻译的服务、提示词和页面行为。", "Choose the service, prompt, and page behavior for page and region translation."],
  longText: ["长文本翻译", "Long text translation", "设置侧边栏长文本翻译使用的服务、提示词和输出方式。", "Choose the service, prompt, and output used by the long-text panel."]
};

export function FeatureTranslationSettings({ feature, step, form, patch }: {
  feature: TranslationFeature;
  step: string;
  form: TranslatorSettings;
  patch: (patch: Partial<TranslatorSettings>) => void;
}) {
  const en = form.uiLanguage === "en";
  const t = (zh: string, english: string) => en ? english : zh;
  const copy = TITLES[feature];
  const effective = settingsForFeature(form, feature);
  const rich = capabilitiesForFeature(form, feature).richOutput;
  const updatePreferences = (changes: Partial<FeatureTranslationPreferences>) => patch(featurePreferencesPatch(form, feature, changes));
  const sceneNames = { general: "General", technical: "Technical", academic: "Academic", business: "Business" } as const;

  return <section className="card feature-settings">
    <div className="section-head"><div><span className="step">{step}</span><h2>{t(copy[0], copy[1])}</h2><p>{t(copy[2], copy[3])}</p></div></div>
    <div className="feature-binding">
      <FeatureServiceSelect settings={form} feature={feature} label={t("翻译服务", "Translation service")} onChange={id => patch(serviceSelectionPatch(form, feature, id))} />
      <p className="ft-help">{form.separateModels
        ? t("此处只修改当前翻译功能的服务；留空时跟随默认服务。", "This changes only this feature; an empty assignment follows the default service.")
        : t("当前所有翻译功能共用默认服务；这里的修改会同步到其他功能。", "All features currently share the default service; changing it here changes the shared default.")}</p>
    </div>

    <div className="feature-group">
      <h3>{t("语言方向", "Language direction")}</h3>
      <LanguageDirection settings={effective} update={updatePreferences} />
    </div>

    {feature === "selection" && <div className="feature-group">
      <h3>{t("划词行为", "Selection behavior")}</h3>
      <div className="grid">
        <label>{t("触发方式", "Trigger mode")}<select value={form.triggerMode} onChange={event => patch({ triggerMode: event.target.value as TranslatorSettings["triggerMode"] })}><option value="click">{t("点击圆点翻译", "Click the dot")}</option><option value="auto">{t("选择后自动翻译", "Translate automatically")}</option></select></label>
        <label>{t("选区字符范围", "Selection length")}<div className="range"><input type="number" min="1" max="100" value={form.minChars} onChange={event => patch({ minChars: Number(event.target.value) })} /><span>{t("至", "to")}</span><input type="number" min="100" max="20000" value={form.maxChars} onChange={event => patch({ maxChars: Number(event.target.value) })} /></div></label>
      </div>
    </div>}

    {feature === "page" && <div className="feature-group">
      <h3>{t("全文行为", "Page behavior")}</h3>
      <PageTranslationPreferences settings={effective} update={patch} />
    </div>}

    <div className="feature-group">
      <h3>{t("提示词与输出", "Prompt and output")}</h3>
      {rich ? <>
        <label>{t("提示词风格", "Prompt style")}<select value={effective.translationScene} onChange={event => updatePreferences({ translationScene: event.target.value as FeatureTranslationPreferences["translationScene"] })}>{TRANSLATION_SCENES.map(scene => <option key={scene.id} value={scene.id}>{en ? sceneNames[scene.id] : scene.name}</option>)}</select><small>{t("使用“提示词设置”中对应风格的内容。", "Uses the matching template from Prompt settings.")}</small></label>
        {feature !== "page" && <>
          <div className="grid">
            <label>{t("思考过程", "Reasoning")}<select value={effective.enableThinking ? "on" : "off"} onChange={event => updatePreferences({ enableThinking: event.target.value === "on" })}><option value="off">{t("关闭（默认）", "Off (default)")}</option><option value="on">{t("开启并显示", "On and visible")}</option></select></label>
            <label>{t("输出模式", "Output mode")}<select value={effective.outputMode} onChange={event => updatePreferences({ outputMode: event.target.value as FeatureTranslationPreferences["outputMode"] })}><option value="translation">{t("仅输出译文", "Translation only")}</option><option value="explanation">{t("译文与表达解释", "Translation and explanation")}</option><option value="vocabulary">{t("译文与重点词汇", "Translation and vocabulary")}</option><option value="grammar">{t("译文与语法说明", "Translation and grammar")}</option></select></label>
          </div>
          <Toggle label={t("智能输出", "Smart output")} checked={effective.smartOutput} onChange={smartOutput => updatePreferences({ smartOutput })} />
          <p className="ft-help">{t("根据文本长度自动选择单词释义、短语解释或句子翻译。", "Chooses word meanings, phrase explanations, or sentence translation from the text length.")}</p>
        </>}
      </> : <p className="standalone-notice">{t("当前服务为机器翻译，只执行纯译文输出，因此不显示提示词和大模型输出设置。切换到大模型服务后会恢复这些设置。", "The current machine translation service only returns translations, so prompt and LLM output settings are hidden. They return when you select an LLM service.")}</p>}
      {feature === "selection" && <TranslationPreferences showSmartOutput={false} settings={effective} update={changes => patch({ terms: changes.terms ?? form.terms })} />}
    </div>

    {feature === "page" && <div className="feature-group">
      <h3>{t("页面显示与网站规则", "Page appearance and website rules")}</h3>
      <ReadingPreferences settings={effective} update={patch} />
    </div>}
  </section>;
}
