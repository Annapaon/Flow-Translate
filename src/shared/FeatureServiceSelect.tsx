import React from "react";
import type { TranslatorSettings } from "./types";
import { isMachine } from "../core/services/capabilities";

export function FeatureServiceSelect({ settings, feature, label, disabled, onChange }: {
  settings: TranslatorSettings;
  feature: "selection" | "page";
  label: string;
  disabled?: boolean;
  onChange: (id: string) => void;
}) {
  const en = settings.uiLanguage === "en";
  const profiles = settings.modelProfiles.filter(profile => profile.enabled);
  return <label>{label}<select aria-label={label} disabled={disabled} value={settings.separateModels ? settings.featureModels[feature] : settings.activeModelId} onChange={event => onChange(event.target.value)}>
    {settings.separateModels && <option value="">{en ? "Follow default service" : "跟随默认服务"}（{profiles.find(profile => profile.id === settings.activeModelId)?.name}）</option>}
    {profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}{!isMachine(profile.provider) && ` · ${profile.model || (en ? "Not configured" : "未配置")}`}</option>)}
  </select></label>;
}
