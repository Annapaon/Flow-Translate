import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { getSettings, saveSettings } from "../../shared/settings";
import type { TranslatorSettings } from "../../shared/types";
import { DEFAULT_SETTINGS } from "../../shared/types";
import "./style.css";

const LANGUAGES = ["简体中文", "繁體中文", "English", "日本語", "한국어", "Français", "Deutsch", "Español"];

function App() {
  const [settings, setSettings] = useState<TranslatorSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings().then((value) => { setSettings(value); setReady(true); });
  }, []);

  async function update(patch: Partial<TranslatorSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaved(false);
    await saveSettings(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1_200);
  }

  function openSettings() {
    browser.tabs.create({ url: browser.runtime.getURL("/options.html") });
    window.close();
  }

  const enabledProfiles = settings.modelProfiles.filter((profile) => profile.enabled);

  return <main className="popup">
    <header><span className="mark">译</span><div><h1>划词翻译</h1><p>{saved ? "已保存" : "快速选择翻译参数"}</p></div></header>
    <label>目标语言
      <select disabled={!ready} value={settings.targetLanguage} onChange={(event) => update({ targetLanguage: event.target.value })}>
        {LANGUAGES.map((language) => <option key={language}>{language}</option>)}
      </select>
    </label>
    <label>翻译模型
      <select disabled={!ready} value={settings.activeModelId} onChange={(event) => update({ activeModelId: event.target.value })}>
        {enabledProfiles.map((profile) => (
          <option key={profile.id} value={profile.id}>{profile.name} · {profile.model || "未配置"}</option>
        ))}
      </select>
    </label>
    <footer><span>选择网页文字后点击圆点</span><button title="打开完整设置" aria-label="打开完整设置" onClick={openSettings}>⚙</button></footer>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
