import React, { useEffect, useRef, useState, type ChangeEvent } from "react";
import { createRoot } from "react-dom/client";
import { createModelProfile, getSettings, saveSettings } from "../../shared/settings";
import { DEFAULT_SCENE_PROMPTS, DEFAULT_SETTINGS, TRANSLATION_SCENES, type ModelProfile, type ModelUsageEntry, type ProviderType, type TestConnectionResponse, type TranslationHistoryEntry, type TranslationScene, type TranslatorSettings } from "../../shared/types";
import { providerRequiresApiKey, sanitizeHeaders, validateApiUrl, validateImportedSettings } from "../../shared/security";
import "./style.css";

const LANGUAGES = ["简体中文", "繁體中文", "English", "日本語", "한국어", "Français", "Deutsch", "Español"];
const SOURCE_LANGUAGES = ["自动检测", ...LANGUAGES];
const PROVIDERS: Array<{ id: ProviderType; name: string; defaultUrl: string; modelPlaceholder: string }> = [
  { id: "openai-compatible", name: "OpenAI（兼容接口）", defaultUrl: "https://api.openai.com/v1", modelPlaceholder: "gpt-4.1-mini" },
  { id: "anthropic", name: "Anthropic（兼容接口）", defaultUrl: "https://api.anthropic.com/v1", modelPlaceholder: "claude-sonnet-4-5、ark-code-latest 或服务商模型名" },
  { id: "gemini", name: "Gemini（Google 原生）", defaultUrl: "https://generativelanguage.googleapis.com/v1beta", modelPlaceholder: "gemini-2.5-flash" },
  { id: "ollama", name: "Ollama（本地）", defaultUrl: "http://localhost:11434/v1", modelPlaceholder: "qwen3:8b" },
  { id: "lm-studio", name: "LM Studio（本地）", defaultUrl: "http://localhost:1234/v1", modelPlaceholder: "已加载的模型名称" },
  { id: "xinference", name: "Xinference（本地）", defaultUrl: "http://localhost:9997/v1", modelPlaceholder: "模型 UID" },
  { id: "vllm", name: "vLLM（本地）", defaultUrl: "http://localhost:8000/v1", modelPlaceholder: "启动服务时指定的模型名称" },
  { id: "sglang", name: "SGLang（本地）", defaultUrl: "http://localhost:30000/v1", modelPlaceholder: "启动服务时指定的模型名称" }
];

function providerName(provider: ProviderType): string {
  return PROVIDERS.find((item) => item.id === provider)?.name ?? provider;
}

function providerDisplayName(provider: ProviderType, english: boolean): string {
  if (!english) return providerName(provider);
  return ({
    "openai-compatible": "OpenAI (compatible API)", anthropic: "Anthropic (compatible API)", gemini: "Gemini (Google native)",
    ollama: "Ollama (local)", "lm-studio": "LM Studio (local)", xinference: "Xinference (local)", vllm: "vLLM (local)", sglang: "SGLang (local)"
  } satisfies Record<ProviderType, string>)[provider];
}

function headersToText(headers: Record<string, string>): string {
  return Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join("\n");
}

function textToHeaders(value: string): Record<string, string> {
  return Object.fromEntries(value.split(/\r?\n/).map((line) => {
    const index = line.indexOf(":");
    return index > 0 ? [line.slice(0, index).trim(), line.slice(index + 1).trim()] : null;
  }).filter((item): item is [string, string] => Boolean(item?.[0])));
}

async function ensureApiPermission(apiBaseUrl: string): Promise<boolean> {
  const url = new URL(apiBaseUrl);
  if (url.protocol !== "https:") return true;
  const origin = `${url.origin}/*`;
  if (await browser.permissions.contains({ origins: [origin] })) return true;
  return browser.permissions.request({ origins: [origin] });
}

function App() {
  const [form, setForm] = useState<TranslatorSettings>(DEFAULT_SETTINGS);
  const [notice, setNotice] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"basic" | "translation" | "prompts" | "models" | "history" | "data">("basic");
  const [editingProfile, setEditingProfile] = useState<ModelProfile | null>(null);
  const [headersDraft, setHeadersDraft] = useState("");
  const [history, setHistory] = useState<TranslationHistoryEntry[]>([]);
  const [historyQuery, setHistoryQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [modelUsage, setModelUsage] = useState<ModelUsageEntry[]>([]);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const en = form.uiLanguage === "en";
  const t = (zh: string, english: string) => en ? english : zh;
  useEffect(() => { getSettings().then(setForm); }, []);
  useEffect(() => { document.title = t("流译助手设置", "Flow Translate Settings"); }, [form.uiLanguage]);
  useEffect(() => {
    if (activeSection === "history") void loadHistory();
    if (activeSection === "models") void loadModelUsage();
  }, [activeSection]);

  async function loadModelUsage() {
    const entries = await browser.runtime.sendMessage({ type: "get-model-usage" }) as ModelUsageEntry[];
    setModelUsage(entries ?? []);
  }

  async function resetModelUsage(id: string) {
    const entries = await browser.runtime.sendMessage({ type: "clear-model-usage", id }) as ModelUsageEntry[];
    setModelUsage(entries ?? []);
    setNotice(t("该模型的使用量统计已清零。", "Usage statistics for this model were reset."));
  }

  function formatCount(value: number): string {
    return new Intl.NumberFormat(en ? "en" : "zh-CN").format(value);
  }

  async function loadHistory() {
    const entries = await browser.runtime.sendMessage({ type: "get-history" }) as TranslationHistoryEntry[];
    setHistory(entries ?? []);
  }

  async function toggleFavorite(id: string) {
    const entries = await browser.runtime.sendMessage({ type: "toggle-history-favorite", id }) as TranslationHistoryEntry[];
    setHistory(entries);
  }

  async function deleteHistory(id: string) {
    const entries = await browser.runtime.sendMessage({ type: "delete-history", id }) as TranslationHistoryEntry[];
    setHistory(entries);
  }

  async function clearAllHistory() {
    await browser.runtime.sendMessage({ type: "clear-history" });
    setHistory([]);
    setNotice(t("翻译历史已清空。翻译缓存未受影响。", "Translation history cleared. The translation cache was not affected."));
  }

  function exportConfiguration(includeSecrets = false) {
    if (includeSecrets && !window.confirm(t("导出文件将包含全部 API Key，确定继续吗？", "The export will contain every API key. Continue?"))) return;
    const exported = includeSecrets ? form : { ...form, privacyConsentAccepted: false, apiKey: "", customHeaders: {}, modelProfiles: form.modelProfiles.map((profile) => ({ ...profile, apiKey: "", customHeaders: {} })) };
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `translator-settings-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(includeSecrets ? t("含密钥配置已导出，请安全保管。", "Configuration with secrets exported. Store it securely.") : t("不含密钥的配置已导出。", "Configuration exported without secrets."));
  }

  async function importConfiguration(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error(t("配置文件不能超过 1 MB", "Configuration file must not exceed 1 MB"));
      const parsed = validateImportedSettings(JSON.parse(await file.text()));
      await saveQueueRef.current;
      await saveSettings({ ...DEFAULT_SETTINGS, ...parsed } as TranslatorSettings);
      const normalized = await getSettings();
      setForm(normalized);
      setNotice(t("配置导入成功并已保存。", "Configuration imported and saved."));
    } catch (error) {
      setNotice(error instanceof Error ? `${t("导入失败：", "Import failed: ")}${error.message}` : t("导入失败：无法读取配置文件", "Import failed: unable to read the file"));
    }
  }

  function autoSave(settings: TranslatorSettings, message: string) {
    saveQueueRef.current = saveQueueRef.current
      .then(() => saveSettings(settings))
      .then(() => setNotice(message));
  }

  function update<K extends keyof TranslatorSettings>(key: K, value: TranslatorSettings[K]) {
    if (key === "triggerMode" && value === "auto" && form.triggerMode !== "auto" && !window.confirm(t("自动翻译会在选择文字后立即发送到模型服务。确定开启吗？", "Auto translation immediately sends selected text to the model service. Enable it?"))) return;
    const next = { ...form, [key]: value };
    setForm(next);
    autoSave(next, t("设置已自动保存。", "Settings saved automatically."));
  }
  function updateScenePrompt(scene: TranslationScene, value: string) {
    const next = { ...form, scenePrompts: { ...form.scenePrompts, [scene]: value } };
    setForm(next);
    autoSave(next, t("提示词已自动保存。", "Prompt saved automatically."));
  }
  function restoreScenePrompt(scene: TranslationScene) {
    updateScenePrompt(scene, DEFAULT_SCENE_PROMPTS[scene]);
    setNotice(t("该场景已恢复默认提示词。", "The default prompt was restored for this scene."));
  }
  function restoreAllScenePrompts() {
    if (!window.confirm(t("确定要将全部场景恢复为默认提示词吗？", "Restore the default prompts for every scene?"))) return;
    const next = { ...form, scenePrompts: { ...DEFAULT_SCENE_PROMPTS } };
    setForm(next);
    autoSave(next, t("全部场景已恢复默认提示词。", "All default scene prompts were restored."));
  }
  async function copyScenePrompt(scene: TranslationScene) {
    await navigator.clipboard.writeText(form.scenePrompts[scene]);
    setNotice(t("提示词已复制。", "Prompt copied."));
  }
  function addProfile() {
    const profile = createModelProfile();
    setEditingProfile(profile);
    setHeadersDraft(headersToText(profile.customHeaders));
  }
  function editProfile(profile: ModelProfile) {
    setEditingProfile({ ...profile });
    setHeadersDraft(headersToText(profile.customHeaders));
  }
  async function saveProfileDraft() {
    if (!editingProfile) return;
    const profileDraft = { ...editingProfile, customHeaders: textToHeaders(headersDraft) };
    const requiresKey = providerRequiresApiKey(profileDraft.provider);
    if (!profileDraft.name.trim() || !profileDraft.model.trim() || !profileDraft.apiBaseUrl.trim() || (requiresKey && !profileDraft.apiKey.trim())) {
      setNotice(requiresKey ? t("请完整填写配置名称、模型名称、API 地址和 API Key。", "Enter a profile name, model, API URL, and API key.") : t("请完整填写配置名称、模型名称和 API 地址。", "Enter a profile name, model, and API URL."));
      return;
    }
    try {
      profileDraft.apiBaseUrl = validateApiUrl(profileDraft.apiBaseUrl);
      profileDraft.customHeaders = sanitizeHeaders(profileDraft.customHeaders);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t("模型配置无效。", "Invalid model configuration."));
      return;
    }
    if (!await ensureApiPermission(profileDraft.apiBaseUrl)) {
      setNotice(t("未授予该模型域名的访问权限，配置未保存。", "Access to this model domain was not granted; the profile was not saved."));
      return;
    }
    const existingProfile = form.modelProfiles.find((profile) => profile.id === profileDraft.id);
    if (existingProfile?.enabled && !profileDraft.enabled && form.modelProfiles.filter((profile) => profile.enabled).length === 1) {
      setNotice(t("至少需要启用一个模型。", "At least one model must be enabled."));
      return;
    }
    const exists = form.modelProfiles.some((profile) => profile.id === profileDraft.id);
    const profiles = exists
      ? form.modelProfiles.map((profile) => profile.id === profileDraft.id ? profileDraft : profile)
      : [...form.modelProfiles, profileDraft];
    const activeStillEnabled = profiles.some((profile) => profile.id === form.activeModelId && profile.enabled);
    const next = {
      ...form,
      activeModelId: !exists && profileDraft.enabled
        ? profileDraft.id
        : activeStillEnabled
          ? form.activeModelId
          : (profileDraft.enabled ? profileDraft.id : profiles.find((profile) => profile.enabled)!.id),
      modelProfiles: profiles
    };
    await saveQueueRef.current;
    await saveSettings(next);
    setForm(await getSettings());
    setEditingProfile(null);
    setNotice(t("模型配置已保存并立即生效。", "Model configuration saved and activated."));
  }
  async function toggleProfile(id: string) {
    const target = form.modelProfiles.find((profile) => profile.id === id);
    if (!target) return;
    if (target.enabled && form.modelProfiles.filter((profile) => profile.enabled).length === 1) {
      setNotice(t("至少需要启用一个模型。", "At least one model must be enabled."));
      return;
    }
    const profiles = form.modelProfiles.map((profile) => profile.id === id ? { ...profile, enabled: !profile.enabled } : profile);
    const activeStillEnabled = profiles.some((profile) => profile.id === form.activeModelId && profile.enabled);
    await saveQueueRef.current;
    await saveSettings({ ...form, modelProfiles: profiles, activeModelId: activeStillEnabled ? form.activeModelId : profiles.find((profile) => profile.enabled)!.id });
    setForm(await getSettings());
    setNotice(t("模型启用状态已保存。", "Model status saved."));
  }
  async function removeProfile(id: string) {
    if (form.modelProfiles.length === 1) { setNotice(t("至少需要保留一个模型配置。", "At least one model profile must remain.")); return; }
    const profiles = form.modelProfiles.filter((profile) => profile.id !== id);
    const activeModelId = form.activeModelId === id ? (profiles.find((profile) => profile.enabled)?.id ?? profiles[0]!.id) : form.activeModelId;
    await saveQueueRef.current;
    await saveSettings({ ...form, modelProfiles: profiles, activeModelId });
    setForm(await getSettings());
    setEditingProfile(null);
    setNotice(t("模型配置已删除并保存。", "Model profile deleted."));
  }
  async function testProfile(profile: ModelProfile) {
    setTestingId(profile.id); setNotice(`${t("正在测试", "Testing")} “${profile.name}”…`);
    const testSettings = { ...form, activeModelId: profile.id, provider: profile.provider, apiBaseUrl: profile.apiBaseUrl, apiKey: profile.apiKey, model: profile.model, temperature: profile.temperature, timeoutMs: profile.timeoutMs, maxOutputTokens: profile.maxOutputTokens, customHeaders: profile.customHeaders };
    try {
      if (!await ensureApiPermission(validateApiUrl(profile.apiBaseUrl))) {
        setNotice(t("未授予该模型域名的访问权限。", "Access to this model domain was not granted."));
        return;
      }
      const response = await browser.runtime.sendMessage({ type: "test-connection", settings: testSettings }) as TestConnectionResponse;
      setNotice(`${profile.name}：${response.message}`);
    } finally { setTestingId(null); }
  }

  async function clearLocalData() {
    if (!window.confirm(t("确定清除翻译历史、缓存和使用量统计吗？模型配置不会删除。", "Clear translation history, cache, and usage statistics? Model profiles will be kept."))) return;
    await browser.runtime.sendMessage({ type: "clear-local-data" });
    setHistory([]); setModelUsage([]); setNotice(t("本地翻译数据已清除。", "Local translation data cleared."));
  }

  async function resetAllSettings() {
    if (!window.confirm(t("这会删除全部模型配置、API Key、历史、缓存和使用量统计，并恢复默认设置。确定继续吗？", "This deletes all model profiles, API keys, history, cache, and usage statistics, then restores defaults. Continue?"))) return;
    await saveQueueRef.current;
    await browser.runtime.sendMessage({ type: "clear-local-data" });
    await saveSettings(DEFAULT_SETTINGS);
    setForm(await getSettings());
    setHistory([]);
    setModelUsage([]);
    setNotice(t("全部本地数据和密钥已删除，设置已恢复默认。", "All local data and keys were deleted, and defaults were restored."));
  }

  const normalizedHistoryQuery = historyQuery.trim().toLowerCase();
  const visibleHistory = history.filter((entry) => {
    if (favoritesOnly && !entry.favorite) return false;
    if (!normalizedHistoryQuery) return true;
    return [entry.sourceText, entry.translatedText, entry.model, entry.pageTitle]
      .some((value) => value?.toLowerCase().includes(normalizedHistoryQuery));
  });
  return <main className="page">
    <header className="hero"><div className="logo">译</div><div><h1>{t("流译助手设置", "Flow Translate Settings")}</h1><p>{t("管理使用偏好和大模型服务。", "Manage preferences and model providers.")}</p></div></header>
    <div className="settings-shell">
      <aside className="settings-nav" aria-label={t("设置菜单", "Settings menu")}>
        <button className={activeSection === "basic" ? "selected" : ""} onClick={() => setActiveSection("basic")}><span>01</span><div><strong>{t("基本信息", "General")}</strong><small>{t("界面、隐私与网站范围", "Interface, privacy, and sites")}</small></div></button>
        <button className={activeSection === "translation" ? "selected" : ""} onClick={() => setActiveSection("translation")}><span>02</span><div><strong>{t("翻译配置", "Translation")}</strong><small>{t("语言与翻译行为", "Languages and behavior")}</small></div></button>
        <button className={activeSection === "prompts" ? "selected" : ""} onClick={() => setActiveSection("prompts")}><span>03</span><div><strong>{t("提示词设置", "Prompts")}</strong><small>{t("按场景配置提示词", "Prompts by scene")}</small></div></button>
        <button className={activeSection === "models" ? "selected" : ""} onClick={() => setActiveSection("models")}><span>04</span><div><strong>{t("模型服务", "Models")}</strong><small>{t("API 与模型管理", "API and model management")}</small></div></button>
        <button className={activeSection === "history" ? "selected" : ""} onClick={() => setActiveSection("history")}><span>05</span><div><strong>{t("翻译历史", "History")}</strong><small>{t("搜索与收藏记录", "Search and favorites")}</small></div></button>
        <button className={activeSection === "data" ? "selected" : ""} onClick={() => setActiveSection("data")}><span>06</span><div><strong>{t("配置管理", "Data")}</strong><small>{t("导入与导出设置", "Import and export")}</small></div></button>
      </aside>
      <div className="settings-content">
      {activeSection === "basic" && <section className="card">
        <div className="section-head"><div><span className="step">01</span><h2>{t("基本信息设置", "General settings")}</h2><p>{t("设置界面语言、隐私和网站范围。", "Configure interface language, privacy, and site access.")}</p></div></div>
        <div className="grid">
          <label>{t("界面语言", "Interface language")}<select value={form.uiLanguage} onChange={(event) => update("uiLanguage", event.target.value as TranslatorSettings["uiLanguage"])}><option value="zh-CN">简体中文</option><option value="en">English</option></select></label>
        </div>
        <div className="privacy-disclosure"><strong>{t("数据处理说明", "Data handling notice")}</strong><p>{t("你选择或输入的文字会发送到你配置的模型服务；页面标题和地址仅在开启历史时保存在本地。开发者不接收这些数据。请勿翻译密码、支付、医疗等敏感信息。", "Selected or entered text is sent to your configured model service. Page titles and URLs are stored locally only when history is enabled. The developer does not receive this data. Do not translate passwords, payment, health, or other sensitive information.")}</p><label><input type="checkbox" checked={form.privacyConsentAccepted} onChange={(event) => update("privacyConsentAccepted", event.target.checked)} />{t("我了解并同意上述数据处理方式", "I understand and agree to this data handling")}</label></div>
        <div className="toggle-grid">
          <label className="toggle"><input type="checkbox" checked={form.enableHistory} onChange={(event) => update("enableHistory", event.target.checked)} /><span><strong>{t("保存翻译历史", "Save translation history")}</strong><small>{t("最多保存最近 100 条", "Keep up to 100 recent entries")}</small></span></label>
          <label className="toggle"><input type="checkbox" checked={form.enableCache} onChange={(event) => update("enableCache", event.target.checked)} /><span><strong>{t("启用翻译缓存", "Enable translation cache")}</strong><small>{t("相同请求 7 天内复用", "Reuse identical requests for 7 days")}</small></span></label>
        </div>
        <label>{t("网站访问模式", "Site access mode")}<select value={form.siteAccessMode} onChange={(event) => update("siteAccessMode", event.target.value as TranslatorSettings["siteAccessMode"])}><option value="blacklist">{t("除黑名单外全部启用", "Enable except blocked sites")}</option><option value="whitelist">{t("仅在白名单网站启用", "Enable only on allowed sites")}</option></select></label>
        {form.siteAccessMode === "blacklist"
          ? <label>{t("禁用网站", "Blocked sites")}<textarea rows={3} value={form.blockedSites.join("\n")} onChange={(event) => update("blockedSites", event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))} placeholder={"bank.example.com\n*.private.example.com"} /><small>{t("每行一个域名，同时匹配其子域名。", "One domain per line; subdomains are included.")}</small></label>
          : <label>{t("允许网站", "Allowed sites")}<textarea rows={3} value={form.allowedSites.join("\n")} onChange={(event) => update("allowedSites", event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))} placeholder={"docs.example.com\n*.company.example.com"} /><small>{t("白名单为空时所有网站均不启用。", "No site is enabled when this list is empty.")}</small></label>}
      </section>}

      {activeSection === "translation" && <section className="card">
        <div className="section-head"><div><span className="step">02</span><h2>{t("翻译配置", "Translation settings")}</h2><p>{t("设置翻译语言、触发行为和输出方式。", "Configure languages, trigger behavior, and output.")}</p></div></div>
        <div className="grid">
          <label>{t("源语言", "Source language")}<select value={form.sourceLanguage} onChange={(event) => update("sourceLanguage", event.target.value)}>{SOURCE_LANGUAGES.map((language) => <option key={language}>{en && language === "自动检测" ? "Auto-detect" : language}</option>)}</select></label>
          <label>{t("默认目标语言", "Default target language")}<select value={form.targetLanguage} onChange={(event) => update("targetLanguage", event.target.value)}>{LANGUAGES.map((language) => <option key={language}>{language}</option>)}</select></label>
          <label>{t("触发方式", "Trigger mode")}<select value={form.triggerMode} onChange={(event) => update("triggerMode", event.target.value as "click" | "auto")}><option value="click">{t("点击圆点翻译", "Click the dot")}</option><option value="auto">{t("选择后自动翻译", "Translate automatically")}</option></select></label>
          <label>{t("思考过程", "Reasoning")}<select value={form.enableThinking ? "on" : "off"} onChange={(event) => update("enableThinking", event.target.value === "on")}><option value="off">{t("关闭（默认）", "Off (default)")}</option><option value="on">{t("开启并显示", "On and visible")}</option></select></label>
          <label>{t("输出模式", "Output mode")}<select value={form.outputMode} onChange={(event) => update("outputMode", event.target.value as TranslatorSettings["outputMode"])}><option value="translation">{t("仅输出译文", "Translation only")}</option><option value="explanation">{t("译文与表达解释", "Translation and explanation")}</option><option value="vocabulary">{t("译文与重点词汇", "Translation and vocabulary")}</option><option value="grammar">{t("译文与语法说明", "Translation and grammar")}</option></select></label>
          <label>{t("选区字符范围", "Selection length")}<div className="range"><input type="number" min="1" max="100" value={form.minChars} onChange={(event) => update("minChars", Number(event.target.value))} /><span>{t("至", "to")}</span><input type="number" min="100" max="20000" value={form.maxChars} onChange={(event) => update("maxChars", Number(event.target.value))} /></div></label>
        </div>
      </section>}

      {activeSection === "prompts" && <section className="card">
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
      </section>}

      {activeSection === "models" && <section className="card">
        <div className="section-head model-head"><div><span className="step">04</span><h2>{t("大模型服务配置", "Model providers")}</h2><p>{t("添加多个云端或本地模型，并在工具栏快速切换。", "Add cloud or local models and switch them from the toolbar.")}</p></div><button type="button" className="add" onClick={addProfile}>＋ {t("添加模型", "Add model")}</button></div>
        <div className="models">{form.modelProfiles.map((profile) => (
          <article className={`model ${form.activeModelId === profile.id ? "active" : ""} ${!profile.enabled ? "disabled" : ""}`} key={profile.id} onClick={() => editProfile(profile)}>
            <div className="model-card-head"><span className={`status ${profile.enabled ? "on" : ""}`}>{profile.enabled ? t("已启用", "Enabled") : t("已停用", "Disabled")}</span>{form.activeModelId === profile.id && <span className="default-badge">{t("默认", "Default")}</span>}<label className="switch" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={profile.enabled} onChange={() => toggleProfile(profile.id)} /><span /></label></div>
            <strong className="profile-name">{profile.name}</strong>
            <div className="profile-model">{providerDisplayName(profile.provider, en)} · {profile.model || t("未配置模型", "Model not configured")}</div>
            <div className="profile-url">{profile.apiBaseUrl}</div>
            {(() => { const usage = modelUsage.find((entry) => entry.modelProfileId === profile.id); return <div className="usage-stats">
              <span><strong>{formatCount(usage?.requestCount ?? 0)}</strong>{t("次请求", "requests")}</span>
              <span><strong>{formatCount(usage?.inputCharacters ?? 0)}</strong>{t("输入字符", "input chars")}</span>
              <span><strong>{formatCount(usage?.outputCharacters ?? 0)}</strong>{t("输出字符", "output chars")}</span>
              <button type="button" disabled={!usage} onClick={(event) => { event.stopPropagation(); void resetModelUsage(profile.id); }}>{t("清零", "Reset")}</button>
              <small>{usage ? `${t("最后使用：", "Last used: ")}${new Date(usage.lastUsedAt).toLocaleString(en ? "en" : "zh-CN")}` : t("暂无使用记录", "No usage recorded")}</small>
            </div>; })()}
            <div className="card-actions"><button type="button" disabled={!profile.enabled || testingId === profile.id} onClick={(event) => { event.stopPropagation(); testProfile(profile); }}>{testingId === profile.id ? t("测试中…", "Testing…") : t("测试", "Test")}</button><span>{t("点击卡片编辑 →", "Click card to edit →")}</span></div>
          </article>
        ))}</div>
        <p className="warning">{t("API Key 保存在浏览器扩展的本地存储中，本地存储不是系统级密钥保险箱。", "API keys are stored in extension-local storage, which is not a system-level secret vault.")}</p>
      </section>}

      {activeSection === "history" && <section className="card">
        <div className="section-head history-head"><div><span className="step">05</span><h2>{t("翻译历史", "Translation history")}</h2><p>{t("记录保存在当前浏览器本地，最多保留最近 100 条。", "Entries are stored in this browser, up to 100 recent items.")}</p></div><button type="button" className="danger-action" disabled={!history.length} onClick={clearAllHistory}>{t("清空历史", "Clear history")}</button></div>
        <div className="history-tools">
          <input aria-label={t("搜索翻译历史", "Search translation history")} value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder={t("搜索原文、译文、模型或网页标题", "Search source, translation, model, or page title")} />
          <label className="favorite-filter"><input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} />{t("只看收藏", "Favorites only")}</label>
        </div>
        <div className="history-list">
          {!visibleHistory.length && <div className="history-empty">{history.length ? t("没有符合条件的记录", "No matching entries") : t("暂无翻译历史", "No translation history")}</div>}
          {visibleHistory.map((entry) => <article className="history-item" key={entry.id}>
            <header><div><strong>{entry.targetLanguage}</strong><span>{entry.model}</span><time>{new Date(entry.createdAt).toLocaleString(en ? "en" : "zh-CN")}</time></div><div className="history-actions"><button type="button" className={entry.favorite ? "favorite active" : "favorite"} title={entry.favorite ? t("取消收藏", "Remove favorite") : t("收藏", "Favorite")} onClick={() => toggleFavorite(entry.id)}>★</button><button type="button" title={t("删除", "Delete")} onClick={() => deleteHistory(entry.id)}>{t("删除", "Delete")}</button></div></header>
            <div className="history-columns"><section><span>{t("原文", "Source")}</span><p>{entry.sourceText}</p><button type="button" onClick={() => navigator.clipboard.writeText(entry.sourceText)}>{t("复制原文", "Copy source")}</button></section><section><span>{t("译文", "Translation")}</span><p>{entry.translatedText}</p><button type="button" onClick={() => navigator.clipboard.writeText(entry.translatedText)}>{t("复制译文", "Copy translation")}</button></section></div>
            {entry.pageTitle && <footer>{entry.pageUrl ? <a href={entry.pageUrl} target="_blank" rel="noreferrer">{entry.pageTitle}</a> : entry.pageTitle}</footer>}
          </article>)}
        </div>
      </section>}

      {activeSection === "data" && <section className="card">
        <div className="section-head"><div><span className="step">06</span><h2>{t("配置管理", "Configuration management")}</h2><p>{t("在浏览器或设备之间迁移翻译设置和模型服务。", "Move translation settings and model providers between browsers or devices.")}</p></div></div>
        <div className="data-actions">
          <article><div><strong>{t("导出安全配置", "Export safe configuration")}</strong><p>{t("默认不导出 API Key 和自定义请求头。", "API keys and custom headers are excluded by default.")}</p></div><span className="export-buttons"><button type="button" onClick={() => exportConfiguration(false)}>{t("导出（不含密钥）", "Export without secrets")}</button><button type="button" onClick={() => exportConfiguration(true)}>{t("导出（包含密钥）", "Export with secrets")}</button></span></article>
          <article><div><strong>{t("导入完整配置", "Import full configuration")}</strong><p>{t("选择此前导出的 JSON 文件，导入后立即覆盖当前配置。", "Choose an exported JSON file to replace the current configuration.")}</p></div><label className="import-button">{t("选择文件", "Choose file")}<input type="file" accept="application/json,.json" onChange={importConfiguration} /></label></article>
          <article><div><strong>{t("清除本地翻译数据", "Clear local translation data")}</strong><p>{t("删除历史、缓存和使用量统计，保留模型配置。", "Delete history, cache, and usage statistics while keeping model profiles.")}</p></div><button type="button" onClick={clearLocalData}>{t("清除数据", "Clear data")}</button></article>
          <article><div><strong>{t("删除全部本地数据", "Delete all local data")}</strong><p>{t("删除模型配置、API Key、历史、缓存和统计，并撤销数据处理同意。", "Delete model profiles, API keys, history, cache, and statistics, and revoke data-processing consent.")}</p></div><button type="button" className="danger-action" onClick={resetAllSettings}>{t("删除并重置", "Delete and reset")}</button></article>
        </div>
        <p className="secret-warning"><strong>{t("敏感信息提醒：", "Sensitive information: ")}</strong>{t("选择“包含密钥”时，导出文件会包含模型 API Key。不要上传到公开仓库、共享目录或发送给不可信的人。", "When exporting with secrets, the file contains model API keys. Do not upload it publicly or share it with untrusted people.")}</p>
      </section>}
      {notice && <div className="standalone-notice">{notice}</div>}
      </div>
    </div>
    {editingProfile && <div className="modal-backdrop" onMouseDown={() => setEditingProfile(null)}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={t("模型设置", "Model settings")} onMouseDown={(event) => event.stopPropagation()}>
        <header><div><h2>{form.modelProfiles.some((profile) => profile.id === editingProfile.id) ? t("编辑模型", "Edit model") : t("添加模型", "Add model")}</h2><p>{t("配置云端兼容服务或本地推理服务。", "Configure a cloud or local inference service.")}</p></div><button type="button" onClick={() => setEditingProfile(null)}>×</button></header>
        <div className="modal-body">
          <div className="grid"><label>{t("服务类型", "Provider type")}<select value={editingProfile.provider} onChange={(event) => { const provider = event.target.value as ProviderType; const definition = PROVIDERS.find((item) => item.id === provider)!; setEditingProfile({ ...editingProfile, provider, apiBaseUrl: definition.defaultUrl, authMode: provider === "anthropic" ? "x-api-key" : "bearer" }); }}>{PROVIDERS.map((provider) => <option key={provider.id} value={provider.id}>{providerDisplayName(provider.id, en)}</option>)}</select></label><label>{t("配置名称", "Profile name")}<input value={editingProfile.name} onChange={(event) => setEditingProfile({ ...editingProfile, name: event.target.value })} placeholder={t("例如：本地推理服务", "For example: Local inference")} /></label></div>
          <label>{t("模型名称", "Model name")}<input value={editingProfile.model} onChange={(event) => setEditingProfile({ ...editingProfile, model: event.target.value })} placeholder={PROVIDERS.find((item) => item.id === editingProfile.provider)?.modelPlaceholder} /></label>
          <label>API Base URL<input value={editingProfile.apiBaseUrl} onChange={(event) => setEditingProfile({ ...editingProfile, apiBaseUrl: event.target.value })} placeholder="https://api.openai.com/v1" /></label>
          <label>API Key{!["openai-compatible", "anthropic", "gemini"].includes(editingProfile.provider) && t("（可选）", " (optional)")}<input type="password" autoComplete="new-password" value={editingProfile.apiKey} onChange={(event) => setEditingProfile({ ...editingProfile, apiKey: event.target.value })} placeholder={["openai-compatible", "anthropic", "gemini"].includes(editingProfile.provider) ? "API Key" : t("本地服务通常无需填写", "Usually not required for local services")} /></label>
          {editingProfile.provider === "anthropic" && <label>{t("鉴权方式", "Authentication")}<select value={editingProfile.authMode} onChange={(event) => setEditingProfile({ ...editingProfile, authMode: event.target.value as ModelProfile["authMode"] })}><option value="x-api-key">x-api-key（Anthropic 官方）</option><option value="bearer">Authorization Bearer（常见第三方）</option><option value="both">{t("同时发送（仅兼容需要时）", "Send both (compatibility only)")}</option></select></label>}
          <div className="grid"><label>Temperature<input type="number" min="0" max="2" step="0.1" value={editingProfile.temperature} onChange={(event) => setEditingProfile({ ...editingProfile, temperature: Number(event.target.value) })} /></label><label>{t("超时时间（秒）", "Timeout (seconds)")}<input type="number" min="5" max="300" value={editingProfile.timeoutMs / 1000} onChange={(event) => setEditingProfile({ ...editingProfile, timeoutMs: Number(event.target.value) * 1000 })} /></label><label>{t("最大输出 Token", "Maximum output tokens")}<input type="number" min="64" max="131072" value={editingProfile.maxOutputTokens} onChange={(event) => setEditingProfile({ ...editingProfile, maxOutputTokens: Number(event.target.value) })} /></label></div>
          <label>{t("自定义请求头", "Custom headers")}<textarea rows={3} value={headersDraft} onChange={(event) => setHeadersDraft(event.target.value)} placeholder={"X-Organization: example\nX-Custom-Key: value"} /><small>{t("每行一个 Header，格式为“名称: 值”。同名项可以覆盖默认请求头。", "One header per line in Name: Value format. Matching names override default headers.")}</small></label>
          <label className="modal-toggle"><input type="checkbox" checked={editingProfile.enabled} onChange={(event) => setEditingProfile({ ...editingProfile, enabled: event.target.checked })} /><span>{t("启用此模型", "Enable this model")}</span></label>
        </div>
        <footer>{form.modelProfiles.some((profile) => profile.id === editingProfile.id) && <button type="button" className="delete-model" onClick={() => removeProfile(editingProfile.id)}>{t("删除模型", "Delete model")}</button>}<span /><button type="button" className="cancel" onClick={() => setEditingProfile(null)}>{t("取消", "Cancel")}</button><button type="button" className="save-model" onClick={saveProfileDraft}>{t("保存模型", "Save model")}</button></footer>
      </section>
    </div>}
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
