import React from "react";
import { isMachine } from "../../../core/services/capabilities";
import { providerDisplayName } from "../../../core/providers/registry";
import type { TranslatorSettings, ModelProfile, ModelUsageEntry } from "../../../shared/types";
export function ModelCards({ form, modelUsage, formatCount, resetModelUsage, profileTestMessages, testingIds, update, testProfile, editProfile, toggleProfile }: {
  form: TranslatorSettings;
  modelUsage: ModelUsageEntry[];
  formatCount: (value: number) => string;
  resetModelUsage: (id: string) => void;
  profileTestMessages: Record<string, { text: string; kind: "success" | "error"; code?: string }>;
  testingIds: Set<string>;
  update: <K extends keyof TranslatorSettings>(key: K, value: TranslatorSettings[K]) => void;
  testProfile: (profile: ModelProfile) => void;
  editProfile: (profile: ModelProfile) => void;
  toggleProfile: (id: string) => void;
}) {
  const en = form.uiLanguage === "en";
  const t = (zh: string, english: string) => en ? english : zh;
  return <div className="models">{form.modelProfiles.map((profile) => (
          <article className={`model ${form.activeModelId === profile.id ? "active" : ""} ${!profile.enabled ? "disabled" : ""}`} key={profile.id} onClick={() => editProfile(profile)}>
            <div className="model-card-head"><span className={`status ${profile.enabled ? "on" : ""}`}>{profile.enabled ? t("已启用", "Enabled") : t("已停用", "Disabled")}</span>{form.activeModelId === profile.id && <span className="default-badge">{t("默认", "Default")}</span>}<label className="switch" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={profile.enabled} onChange={() => toggleProfile(profile.id)} /><span /></label></div>
            <strong className="profile-name">{profile.name}</strong>
            <div className="profile-model">{providerDisplayName(profile.provider, en)}{!isMachine(profile.provider) && <> · {profile.model || t("未配置模型", "Model not configured")}</>}</div>
            <div className="profile-url">{profile.apiBaseUrl}</div>
            {(() => { const usage = modelUsage.find((entry) => entry.modelProfileId === profile.id); return <div className="usage-stats">
              <span><strong>{formatCount(usage?.requestCount ?? 0)}</strong>{t("次完成", "completed")}</span>
              <span><strong>{formatCount(usage?.serviceCallCount ?? 0)}</strong>{t("次 API 尝试", "API attempts")}</span>
              <span><strong>{formatCount(usage?.inputCharacters ?? 0)}</strong>{t("输入字符", "input chars")}</span>
              <span><strong>{formatCount(usage?.outputCharacters ?? 0)}</strong>{t("输出字符", "output chars")}</span>
              <button type="button" disabled={!usage} onClick={(event) => { event.stopPropagation(); void resetModelUsage(profile.id); }}>{t("清零", "Reset")}</button>
              <small>{usage ? `${t("最后使用：", "Last used: ")}${new Date(usage.lastUsedAt).toLocaleString(en ? "en" : "zh-CN")}` : t("暂无使用记录", "No usage recorded")}</small>
            </div>; })()}
            {Object.values(form.featureModels).includes(profile.id) && <p className="model-binding-note">{t("已绑定：", "Assigned to: ")}{([ ["selection", t("划词翻译", "Selection")], ["page", t("全文翻译", "Page")], ["longText", t("长文本翻译", "Long text")] ] as const).filter(([feature]) => form.featureModels[feature] === profile.id).map(([, label]) => label).join(" / ")}{t("；停用或删除后将跟随默认模型。", "; disabling or deleting returns these features to the default model.")}</p>}
            <div className="card-actions"><div className="model-card-buttons"><button type="button" disabled={!profile.enabled || form.activeModelId === profile.id} onClick={event => { event.stopPropagation(); update("activeModelId", profile.id); }}>{form.activeModelId === profile.id ? t("当前默认", "Current default") : t("设为默认", "Set as default")}</button><button type="button" disabled={!profile.enabled || testingIds.has(profile.id)} onClick={(event) => { event.stopPropagation(); testProfile(profile); }}>{testingIds.has(profile.id) ? t("测试中…", "Testing…") : t("测试", "Test")}</button></div><span>{t("点击卡片编辑 →", "Click card to edit →")}</span></div>
            {profileTestMessages[profile.id] && <div className={`model-test-message ${profileTestMessages[profile.id]!.kind}`} role={profileTestMessages[profile.id]!.kind === "error" ? "alert" : "status"} onClick={event => event.stopPropagation()}>{profileTestMessages[profile.id]!.text}{profileTestMessages[profile.id]!.code && <details><summary>{t("诊断详情", "Diagnostic details")}</summary><code>{profileTestMessages[profile.id]!.code}</code></details>}</div>}
          </article>
        ))}</div>;
}
