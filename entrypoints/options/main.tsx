import React, { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { createModelProfile, getSettings, saveSettings } from "../../shared/settings";
import { DEFAULT_SETTINGS, type ModelProfile, type TestConnectionResponse, type TranslatorSettings } from "../../shared/types";
import "./style.css";

const LANGUAGES = ["简体中文", "繁體中文", "English", "日本語", "한국어", "Français", "Deutsch", "Español"];

function App() {
  const [form, setForm] = useState<TranslatorSettings>(DEFAULT_SETTINGS);
  const [notice, setNotice] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"basic" | "models">("basic");
  const [editingProfile, setEditingProfile] = useState<ModelProfile | null>(null);
  useEffect(() => { getSettings().then(setForm); }, []);

  function update<K extends keyof TranslatorSettings>(key: K, value: TranslatorSettings[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  function addProfile() {
    setEditingProfile(createModelProfile());
  }
  function editProfile(profile: ModelProfile) {
    setEditingProfile({ ...profile });
  }
  function saveProfileDraft() {
    if (!editingProfile) return;
    if (!editingProfile.name.trim() || !editingProfile.model.trim() || !editingProfile.apiBaseUrl.trim() || !editingProfile.apiKey.trim()) {
      setNotice("请完整填写模型名称、API 地址和 API Key。");
      return;
    }
    const existingProfile = form.modelProfiles.find((profile) => profile.id === editingProfile.id);
    if (existingProfile?.enabled && !editingProfile.enabled && form.modelProfiles.filter((profile) => profile.enabled).length === 1) {
      setNotice("至少需要启用一个模型。");
      return;
    }
    setForm((current) => {
      const exists = current.modelProfiles.some((profile) => profile.id === editingProfile.id);
      const profiles = exists
        ? current.modelProfiles.map((profile) => profile.id === editingProfile.id ? editingProfile : profile)
        : [...current.modelProfiles, editingProfile];
      const activeStillEnabled = profiles.some((profile) => profile.id === current.activeModelId && profile.enabled);
      return {
        ...current,
        activeModelId: activeStillEnabled
          ? current.activeModelId
          : (editingProfile.enabled ? editingProfile.id : profiles.find((profile) => profile.enabled)!.id),
        modelProfiles: profiles
      };
    });
    setEditingProfile(null);
    setNotice("模型配置已更新，点击保存全部设置后生效。");
  }
  function toggleProfile(id: string) {
    setForm((current) => {
      const target = current.modelProfiles.find((profile) => profile.id === id);
      if (!target) return current;
      if (target.enabled && current.modelProfiles.filter((profile) => profile.enabled).length === 1) {
        setNotice("至少需要启用一个模型。");
        return current;
      }
      const profiles = current.modelProfiles.map((profile) => profile.id === id ? { ...profile, enabled: !profile.enabled } : profile);
      const activeStillEnabled = profiles.some((profile) => profile.id === current.activeModelId && profile.enabled);
      return { ...current, modelProfiles: profiles, activeModelId: activeStillEnabled ? current.activeModelId : profiles.find((profile) => profile.enabled)!.id };
    });
  }
  function removeProfile(id: string) {
    if (form.modelProfiles.length === 1) { setNotice("至少需要保留一个模型配置。"); return; }
    setForm((current) => {
      const profiles = current.modelProfiles.filter((profile) => profile.id !== id);
      return { ...current, modelProfiles: profiles, activeModelId: current.activeModelId === id ? profiles[0]!.id : current.activeModelId };
    });
    setEditingProfile(null);
  }
  async function persist(event: FormEvent) {
    event.preventDefault();
    await saveSettings(form);
    setNotice("全部设置已保存。");
  }
  async function testProfile(profile: ModelProfile) {
    setTestingId(profile.id); setNotice(`正在测试“${profile.name}”…`);
    const testSettings = { ...form, activeModelId: profile.id, apiBaseUrl: profile.apiBaseUrl, apiKey: profile.apiKey, model: profile.model, temperature: profile.temperature, timeoutMs: profile.timeoutMs };
    try {
      const response = await browser.runtime.sendMessage({ type: "test-connection", settings: testSettings }) as TestConnectionResponse;
      setNotice(`${profile.name}：${response.message}`);
    } finally { setTestingId(null); }
  }

  return <main className="page">
    <header className="hero"><div className="logo">译</div><div><h1>划词翻译设置</h1><p>管理使用偏好和大模型服务。</p></div></header>
    <div className="settings-shell">
      <aside className="settings-nav" aria-label="设置菜单">
        <button className={activeSection === "basic" ? "selected" : ""} onClick={() => setActiveSection("basic")}><span>01</span><div><strong>基本信息</strong><small>翻译行为与隐私</small></div></button>
        <button className={activeSection === "models" ? "selected" : ""} onClick={() => setActiveSection("models")}><span>02</span><div><strong>模型服务</strong><small>API 与模型管理</small></div></button>
      </aside>
      <form className="settings-content" onSubmit={persist}>
      {activeSection === "basic" && <section className="card">
        <div className="section-head"><div><span className="step">01</span><h2>基本信息设置</h2><p>设置翻译行为、隐私和网站范围。</p></div></div>
        <div className="grid">
          <label>默认目标语言<select value={form.targetLanguage} onChange={(event) => update("targetLanguage", event.target.value)}>{LANGUAGES.map((language) => <option key={language}>{language}</option>)}</select></label>
          <label>触发方式<select value={form.triggerMode} onChange={(event) => update("triggerMode", event.target.value as "click" | "auto")}><option value="click">点击圆点翻译</option><option value="auto">选择后自动翻译</option></select></label>
          <label>思考过程<select value={form.enableThinking ? "on" : "off"} onChange={(event) => update("enableThinking", event.target.value === "on")}><option value="off">关闭（默认）</option><option value="on">开启并显示</option></select></label>
          <label>选区字符范围<div className="range"><input type="number" min="1" max="100" value={form.minChars} onChange={(event) => update("minChars", Number(event.target.value))} /><span>至</span><input type="number" min="100" max="20000" value={form.maxChars} onChange={(event) => update("maxChars", Number(event.target.value))} /></div></label>
        </div>
        <div className="toggle-grid">
          <label className="toggle"><input type="checkbox" checked={form.enableHistory} onChange={(event) => update("enableHistory", event.target.checked)} /><span><strong>保存翻译历史</strong><small>最多保存最近 100 条</small></span></label>
          <label className="toggle"><input type="checkbox" checked={form.enableCache} onChange={(event) => update("enableCache", event.target.checked)} /><span><strong>启用翻译缓存</strong><small>相同请求 7 天内复用</small></span></label>
        </div>
        <label>系统提示词<textarea rows={4} value={form.systemPrompt} onChange={(event) => update("systemPrompt", event.target.value)} /></label>
        <label>禁用网站<textarea rows={3} value={form.blockedSites.join("\n")} onChange={(event) => update("blockedSites", event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))} placeholder={"bank.example.com\n*.private.example.com"} /><small>每行一个域名，同时匹配其子域名。</small></label>
      </section>}

      {activeSection === "models" && <section className="card">
        <div className="section-head model-head"><div><span className="step">02</span><h2>大模型服务配置</h2><p>添加多个 OpenAI-compatible 模型，并在工具栏快速切换。</p></div><button type="button" className="add" onClick={addProfile}>＋ 添加模型</button></div>
        <div className="models">{form.modelProfiles.map((profile) => (
          <article className={`model ${form.activeModelId === profile.id ? "active" : ""} ${!profile.enabled ? "disabled" : ""}`} key={profile.id} onClick={() => editProfile(profile)}>
            <div className="model-card-head"><span className={`status ${profile.enabled ? "on" : ""}`}>{profile.enabled ? "已启用" : "已停用"}</span>{form.activeModelId === profile.id && <span className="default-badge">默认</span>}<label className="switch" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={profile.enabled} onChange={() => toggleProfile(profile.id)} /><span /></label></div>
            <strong className="profile-name">{profile.name}</strong>
            <div className="profile-model">{profile.model || "未配置模型"}</div>
            <div className="profile-url">{profile.apiBaseUrl}</div>
            <div className="card-actions"><button type="button" disabled={!profile.enabled || testingId === profile.id} onClick={(event) => { event.stopPropagation(); testProfile(profile); }}>{testingId === profile.id ? "测试中…" : "测试"}</button><span>点击卡片编辑 →</span></div>
          </article>
        ))}</div>
        <p className="warning">API Key 保存在浏览器扩展的本地存储中，本地存储不是系统级密钥保险箱。</p>
      </section>}
      <div className="toolbar"><span>{notice}</span><button type="submit">保存全部设置</button></div>
      </form>
    </div>
    {editingProfile && <div className="modal-backdrop" onMouseDown={() => setEditingProfile(null)}>
      <section className="modal" role="dialog" aria-modal="true" aria-label="模型设置" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><h2>{form.modelProfiles.some((profile) => profile.id === editingProfile.id) ? "编辑模型" : "添加模型"}</h2><p>配置 OpenAI-compatible 模型服务。</p></div><button type="button" onClick={() => setEditingProfile(null)}>×</button></header>
        <div className="modal-body">
          <div className="grid"><label>配置名称<input value={editingProfile.name} onChange={(event) => setEditingProfile({ ...editingProfile, name: event.target.value })} placeholder="例如：DeepSeek" /></label><label>模型名称<input value={editingProfile.model} onChange={(event) => setEditingProfile({ ...editingProfile, model: event.target.value })} placeholder="deepseek-chat" /></label></div>
          <label>API Base URL<input value={editingProfile.apiBaseUrl} onChange={(event) => setEditingProfile({ ...editingProfile, apiBaseUrl: event.target.value })} placeholder="https://api.openai.com/v1" /></label>
          <label>API Key<input type="password" value={editingProfile.apiKey} onChange={(event) => setEditingProfile({ ...editingProfile, apiKey: event.target.value })} placeholder="sk-..." /></label>
          <div className="grid"><label>Temperature<input type="number" min="0" max="2" step="0.1" value={editingProfile.temperature} onChange={(event) => setEditingProfile({ ...editingProfile, temperature: Number(event.target.value) })} /></label><label>超时时间（秒）<input type="number" min="5" max="300" value={editingProfile.timeoutMs / 1000} onChange={(event) => setEditingProfile({ ...editingProfile, timeoutMs: Number(event.target.value) * 1000 })} /></label></div>
          <label className="modal-toggle"><input type="checkbox" checked={editingProfile.enabled} onChange={(event) => setEditingProfile({ ...editingProfile, enabled: event.target.checked })} /><span>启用此模型</span></label>
        </div>
        <footer>{form.modelProfiles.some((profile) => profile.id === editingProfile.id) && <button type="button" className="delete-model" onClick={() => removeProfile(editingProfile.id)}>删除模型</button>}<span /><button type="button" className="cancel" onClick={() => setEditingProfile(null)}>取消</button><button type="button" className="save-model" onClick={saveProfileDraft}>保存模型</button></footer>
      </section>
    </div>}
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
