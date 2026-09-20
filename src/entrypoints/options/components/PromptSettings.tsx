import React from "react";
import { DEFAULT_SCENE_PROMPTS, TRANSLATION_SCENES, type TranslatorSettings, type TranslationScene } from "../../../shared/types";
export function PromptSettings({ form, updateScenePrompt, copyScenePrompt, restoreScenePrompt, restoreAllScenePrompts, update }: {
  form: TranslatorSettings;
  updateScenePrompt: (scene: TranslationScene, value: string) => void;
  copyScenePrompt: (scene: TranslationScene) => void;
  restoreScenePrompt: (scene: TranslationScene) => void;
  restoreAllScenePrompts: () => void;
  update: <K extends keyof TranslatorSettings>(key: K, value: TranslatorSettings[K]) => void;
}) {
  const en = form.uiLanguage === "en";
  const t = (zh: string, english: string) => en ? english : zh;
  return <section className="card">
        <div className="section-head"><div><span className="step">03</span><h2>{t("提示词设置", "Prompt settings")}</h2><p>{t("分别配置不同翻译场景的提示词，使用时可在插件弹窗中快速切换。", "Configure prompts for each scene and switch them from the extension popup.")}</p></div><button type="button" className="reset-all" onClick={restoreAllScenePrompts}>{t("全部恢复默认", "Restore all defaults")}</button></div>
        <p className="template-help">{t("支持变量：", "Available variables: ")}<code>{"{{sourceLanguage}}"}</code>、<code>{"{{targetLanguage}}"}</code>、<code>{"{{outputMode}}"}</code>、<code>{"{{scene}}"}</code></p>
        <div className="prompt-list">
          {TRANSLATION_SCENES.map((scene) => <div className="prompt-item" key={scene.id}>
            <div className="prompt-title"><span><strong>{en ? ({ general: "General", technical: "Technical", academic: "Academic", business: "Business" }[scene.id]) : scene.name}</strong><small>{en ? ({ general: "Natural and accurate for everyday content", technical: "Preserves terminology, code, and identifiers", academic: "Rigorous and suitable for academic writing", business: "Professional and concise business language" }[scene.id]) : scene.description}</small></span><em>{form.scenePrompts[scene.id] === DEFAULT_SCENE_PROMPTS[scene.id] ? t("默认", "Default") : t("已自定义", "Customized")}</em></div>
            <textarea rows={5} value={form.scenePrompts[scene.id]} onChange={(event) => updateScenePrompt(scene.id, event.target.value)} placeholder={t(`请输入${scene.name}场景提示词`, `Enter the ${scene.id} scene prompt`)} />
            <div className="prompt-actions"><span>{form.scenePrompts[scene.id].length} {t("字符", "characters")}</span><button type="button" onClick={() => copyScenePrompt(scene.id)}>{t("复制", "Copy")}</button><button type="button" disabled={form.scenePrompts[scene.id] === DEFAULT_SCENE_PROMPTS[scene.id]} onClick={() => restoreScenePrompt(scene.id)}>{t("恢复默认", "Restore default")}</button></div>
          </div>)}
        </div>
        <label>{t("基础系统提示词", "Base system prompt")}<textarea rows={4} value={form.systemPrompt} onChange={(event) => update("systemPrompt", event.target.value)} /><small>{t("所有场景都会使用，用于约束翻译任务和安全边界。", "Used for every scene to define the translation task and safety boundary.")}</small></label>
      </section>;
}
