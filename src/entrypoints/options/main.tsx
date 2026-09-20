import { ModelCards } from "./components/ModelCards";
import { PromptSettings } from "./components/PromptSettings";
import { ShortcutStatus } from "./components/ShortcutStatus";
import { FeatureTranslationSettings } from "./components/FeatureTranslationSettings";
import { usePrivacyNotice, confirmPrivacyConsent, resetPrivacyNotices } from "../../shared/privacy-notices";
import { requestApiPermissions } from "../../shared/api-permissions";
import { Toggle } from "../../shared/LanguageDirection";
import { pausedSites, disabledSites } from "../../shared/site-access";
import { isMachine } from "../../core/services/capabilities";
import React, { useEffect, useRef, useState, type ChangeEvent } from "react";
import { createRoot } from "react-dom/client";
import { createModelProfile, getSettings, saveSettings, saveSettingsChanges } from "../../shared/settings";
import { DEFAULT_SCENE_PROMPTS, DEFAULT_SETTINGS, type KeyStorageMode, type ModelProfile, type ModelUsageEntry, type ProviderType, type TestConnectionResponse, type TranslationHistoryEntry, type TranslationScene, type TranslatorSettings } from "../../shared/types";
import { providerRequiresApiKey, sanitizeHeaders, validateApiUrl, validateImportedSettings } from "../../shared/security";
import { findProviderPreset, PROVIDER_PRESETS, providerDisplayName } from "../../core/providers/registry";
import "./style.css";


function headersToText(headers: Record<string, string>): string {
  return Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join("\n");
}

function textToHeaders(value: string): Record<string, string> {
  return Object.fromEntries(value.split(/\r?\n/).map((line) => {
    const index = line.indexOf(":");
    return index > 0 ? [line.slice(0, index).trim(), line.slice(index + 1).trim()] : null;
  }).filter((item): item is [string, string] => Boolean(item?.[0])));
}

const ensureApiPermission = (apiBaseUrl: string) => requestApiPermissions([apiBaseUrl]);

function App() {
  const privacyNotice = usePrivacyNotice("options");
  const [confirmingPrivacy, setConfirmingPrivacy] = useState(false);
  async function confirmPrivacy() {
    setConfirmingPrivacy(true);
    try {
      await saveQueueRef.current;
      // Patch only the consent flag; leave any in-progress edits in the form
      // untouched so they are not reverted to stored values.
      await confirmPrivacyConsent("options");
      setForm(prev => ({ ...prev, privacyConsentAccepted: true }));
    } catch {
      announce(t("确认未保存，请重试。", "Confirmation was not saved. Please retry."), "error");
    } finally { setConfirmingPrivacy(false); }
  }

  const [form, setForm] = useState<TranslatorSettings>(DEFAULT_SETTINGS);
  const [pendingImport, setPendingImport] = useState<{ settings: TranslatorSettings; name: string } | null>(null);
  const [includeWebsiteRules, setIncludeWebsiteRules] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importConsent, setImportConsent] = useState(false);
  const importRevision = useRef(0);
  const importBusy = useRef(false);
  const [notice, setNotice] = useState("");
  const [noticeKind, setNoticeKind] = useState<"info" | "success" | "error">("info");
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set());
  const [profileTestMessages, setProfileTestMessages] = useState<Record<string, { text: string; kind: "success" | "error"; code?: string }>>({});
  const profileTestTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [activeSection, setActiveSection] = useState<"basic" | "selection" | "page" | "longText" | "prompts" | "models" | "history" | "data">("basic");
  const [editingProfile, setEditingProfile] = useState<ModelProfile | null>(null);
  const [headersDraft, setHeadersDraft] = useState("");
  const [modalMessage, setModalMessage] = useState<{ text: string; kind: "success" | "error" } | null>(null);
  const [testingDraft, setTestingDraft] = useState(false);
  const [history, setHistory] = useState<TranslationHistoryEntry[]>([]);
  const [historyQuery, setHistoryQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [modelUsage, setModelUsage] = useState<ModelUsageEntry[]>([]);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sectionRevision = useRef(0);
  const currentRevision = sectionRevision.current;
  const en = form.uiLanguage === "en";
  const t = (zh: string, english: string) => en ? english : zh;
  const announce = (text: string, kind: "info" | "success" | "error" = "info") => {
    // Ignore delayed results from a section the user has already left.
    if (currentRevision !== sectionRevision.current) return;
    clearTimeout(noticeTimer.current);
    setNotice(text);
    setNoticeKind(kind);
    noticeTimer.current = setTimeout(() => setNotice(""), 4_000);
  };
  function selectSection(section: typeof activeSection) {
    if (section === activeSection) return;
    sectionRevision.current += 1;
    importRevision.current += 1;
    setPendingImport(null);
    setImportConsent(false);
    clearTimeout(noticeTimer.current);
    setNotice("");
    setModalMessage(null);
    setProfileTestMessages({});
    for (const timer of profileTestTimers.current.values()) clearTimeout(timer);
    profileTestTimers.current.clear();
    setActiveSection(section);
  }
  useEffect(() => () => {
    sectionRevision.current += 1;
    importRevision.current += 1;
    clearTimeout(noticeTimer.current);
    for (const timer of profileTestTimers.current.values()) clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!modalMessage) return;
    const timer = setTimeout(() => setModalMessage(null), 4_000);
    return () => clearTimeout(timer);
  }, [modalMessage]);
  useEffect(() => { getSettings().then(setForm); }, []);
  useEffect(() => { document.title = t("流译助手设置", "Flow Translate Settings"); document.documentElement.lang = en ? "en" : "zh-CN"; }, [form.uiLanguage]);
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
    announce(t("该模型的使用量统计已清零。", "Usage statistics for this model were reset."), "success");
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
    announce(t("翻译历史已清空。翻译缓存未受影响。", "Translation history cleared. The translation cache was not affected."), "success");
  }

  function exportConfiguration(includeSecrets = false) {
    if (includeSecrets && !window.confirm(t("导出文件将包含全部 API Key，确定继续吗？", "The export will contain every API key. Continue?"))) return;
    const exported = includeSecrets ? { ...form } : { ...form, privacyConsentAccepted: false, apiKey: "", customHeaders: {}, modelProfiles: form.modelProfiles.map((profile) => ({ ...profile, apiKey: "", customHeaders: {} })) };
    // A secrets export is a full backup: website rules always ship with it.
    // Only the safe export honors the include-website-rules toggle.
    if (!includeSecrets && !includeWebsiteRules) delete (exported as Partial<TranslatorSettings>).siteRules;
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `translator-settings-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    announce(includeSecrets ? t("含密钥配置已导出，请安全保管。", "Configuration with secrets exported. Store it securely.") : t("不含密钥的配置已导出。", "Configuration exported without secrets."), "success");
  }

  async function importConfiguration(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || importBusy.current) return;
    const revision = ++importRevision.current;
    setPendingImport(null); setImportConsent(false);
    clearTimeout(noticeTimer.current); setNotice("");
    try {
      if (file.size > 1_000_000) throw new Error(t("配置文件不能超过 1 MB", "Configuration file must not exceed 1 MB"));
      const parsed = validateImportedSettings(JSON.parse(await file.text()), en);
      if (revision !== importRevision.current) return;
      setPendingImport({ settings: { ...DEFAULT_SETTINGS, ...parsed } as TranslatorSettings, name: file.name });
    } catch (error) {
      if (revision !== importRevision.current) return;
      announce(error instanceof Error ? `${t("导入失败：", "Import failed: ")}${error.message}` : t("导入失败：无法读取配置文件", "Import failed: unable to read the file"), "error");
    }
  }

  async function importAndEnable() {
    if (!pendingImport || importBusy.current || (!form.privacyConsentAccepted && !importConsent)) return;
    const revision = importRevision.current;
    const imported = pendingImport.settings;
    const profiles = imported.modelProfiles.filter(profile => profile.enabled);
    // Normalization enables the first profile when a file has no enabled models.
    const enabled = profiles.length ? profiles : imported.modelProfiles.slice(0, 1);
    importBusy.current = true; setImporting(true);
    try {
      // No awaits precede this request: Chrome must associate it with this click.
      const granted = await requestApiPermissions(enabled.map(profile => profile.apiBaseUrl));
      if (revision !== importRevision.current) return;
      if (!granted) {
        announce(t("未授予接口访问权限，未导入配置。可以再次点击“导入并启用”。", "Endpoint access was not granted. Configuration was not imported; you can retry Import and enable."), "error");
        return;
      }
      let committed = false;
      const save = saveQueueRef.current.then(async () => {
        const current = await getSettings();
        if (revision !== importRevision.current) return;
        if (!current.privacyConsentAccepted && !importConsent)
          throw new Error(t("请先确认数据处理说明，再导入并启用。", "Accept the data handling notice before importing and enabling."));
        await saveSettings({ ...imported, privacyConsentAccepted: current.privacyConsentAccepted || importConsent });
        committed = true;
      });
      saveQueueRef.current = save.catch(() => {});
      await save;
      if (!committed || revision !== importRevision.current) return;
      setForm(await getSettings());
      setPendingImport(null); setImportConsent(false);
      announce(t("配置已导入并启用，已完成接口授权，无需逐个保存模型。", "Configuration imported and enabled with endpoint access; no need to save each model."), "success");
    } catch (error) {
      if (revision === importRevision.current)
        announce(error instanceof Error ? `${t("导入失败：", "Import failed: ")}${error.message}` : t("导入失败", "Import failed"), "error");
    } finally { importBusy.current = false; setImporting(false); }
  }

  function autoSave(settings: TranslatorSettings, message: string) {
    const before = form;
    saveQueueRef.current = saveQueueRef.current
      .then(() => saveSettingsChanges(before, settings))
      .then(() => announce(message))
      .catch(error => announce(error instanceof Error ? error.message : t("保存失败", "Save failed"), "error"));
  }

  function update<K extends keyof TranslatorSettings>(key: K, value: TranslatorSettings[K]) {
    if (key === "triggerMode" && value === "auto" && form.triggerMode !== "auto" && !window.confirm(t("自动翻译会在选择文字后立即发送到模型服务。确定开启吗？", "Auto translation immediately sends selected text to the model service. Enable it?"))) return;
    const next = { ...form, [key]: value };
    setForm(next);
    autoSave(next, t("设置已自动保存。", "Settings saved automatically."));
  }
  function patchForm(changes: Partial<TranslatorSettings>) {
    if (changes.triggerMode === "auto" && form.triggerMode !== "auto" && !window.confirm(t("自动翻译会在选择文字后立即发送到模型服务。确定开启吗？", "Auto translation immediately sends selected text to the model service. Enable it?"))) return;
    const next = { ...form, ...changes };
    setForm(next);
    autoSave(next, t("设置已保存", "Settings saved"));
  }
  function updateScenePrompt(scene: TranslationScene, value: string) {
    const next = { ...form, scenePrompts: { ...form.scenePrompts, [scene]: value } };
    setForm(next);
    autoSave(next, t("提示词已自动保存。", "Prompt saved automatically."));
  }
  function restoreScenePrompt(scene: TranslationScene) {
    updateScenePrompt(scene, DEFAULT_SCENE_PROMPTS[scene]);
    announce(t("该场景已恢复默认提示词。", "The default prompt was restored for this scene."), "success");
  }
  function restoreAllScenePrompts() {
    if (!window.confirm(t("确定要将全部场景恢复为默认提示词吗？", "Restore the default prompts for every scene?"))) return;
    const next = { ...form, scenePrompts: { ...DEFAULT_SCENE_PROMPTS } };
    setForm(next);
    autoSave(next, t("全部场景已恢复默认提示词。", "All default scene prompts were restored."));
  }
  async function copyScenePrompt(scene: TranslationScene) {
    await navigator.clipboard.writeText(form.scenePrompts[scene]);
    announce(t("提示词已复制。", "Prompt copied."), "success");
  }
  function addProfile() {
    const profile = createModelProfile();
    setEditingProfile(profile);
    setHeadersDraft(headersToText(profile.customHeaders));
    setModalMessage(null);
  }
  function editProfile(profile: ModelProfile) {
    setEditingProfile({ ...profile });
    setHeadersDraft(headersToText(profile.customHeaders));
    setModalMessage(null);
  }
  function draftProfile(): ModelProfile {
    return { ...editingProfile!, customHeaders: textToHeaders(headersDraft) };
  }
  async function saveProfileDraft() {
    if (!editingProfile) return;
    setModalMessage(null);
    const profileDraft = draftProfile();
    if (profileDraft.provider === "baidu" && !profileDraft.appId?.trim()) { setModalMessage({kind:"error",text:"请填写百度 App ID / Enter Baidu App ID"}); return; }
    const requiresKey = providerRequiresApiKey(profileDraft.provider);
    if (!profileDraft.name.trim() || (!isMachine(profileDraft.provider) && !profileDraft.model.trim()) || !profileDraft.apiBaseUrl.trim() || (requiresKey && !profileDraft.apiKey.trim())) {
      setModalMessage({ kind: "error", text: requiresKey ? t("请完整填写配置名称、模型名称、API 地址和 API Key。", "Enter a profile name, model, API URL, and API key.") : t("请完整填写配置名称、模型名称和 API 地址。", "Enter a profile name, model, and API URL.") });
      return;
    }
    try {
      profileDraft.apiBaseUrl = validateApiUrl(profileDraft.apiBaseUrl, en);
      profileDraft.customHeaders = sanitizeHeaders(profileDraft.customHeaders, en);
    } catch (error) {
      setModalMessage({ kind: "error", text: error instanceof Error ? error.message : t("模型配置无效。", "Invalid model configuration.") });
      return;
    }
    if (!await ensureApiPermission(profileDraft.apiBaseUrl)) {
      setModalMessage({ kind: "error", text: t("未授予该模型地址的访问权限，配置未保存。", "Access to this model endpoint was not granted; the profile was not saved.") });
      return;
    }
    const existingProfile = form.modelProfiles.find((profile) => profile.id === profileDraft.id);
    if (existingProfile?.enabled && !profileDraft.enabled && form.modelProfiles.filter((profile) => profile.enabled).length === 1) {
      setModalMessage({ kind: "error", text: t("至少需要启用一个模型。", "At least one model must be enabled.") });
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
    await saveSettingsChanges(form, next);
    setForm(await getSettings());
    setEditingProfile(null);
    announce(t("模型配置已保存并立即生效。", "Model configuration saved and activated."), "success");
  }
  async function toggleProfile(id: string) {
    const target = form.modelProfiles.find((profile) => profile.id === id);
    if (!target) return;
    if (target.enabled && form.modelProfiles.filter((profile) => profile.enabled).length === 1) {
      announce(t("至少需要启用一个模型。", "At least one model must be enabled."), "error");
      return;
    }
    const profiles = form.modelProfiles.map((profile) => profile.id === id ? { ...profile, enabled: !profile.enabled } : profile);
    const activeStillEnabled = profiles.some((profile) => profile.id === form.activeModelId && profile.enabled);
    await saveQueueRef.current;
    await saveSettingsChanges(form, { ...form, modelProfiles: profiles, activeModelId: activeStillEnabled ? form.activeModelId : profiles.find((profile) => profile.enabled)!.id });
    setForm(await getSettings());
    announce(t("模型启用状态已保存。", "Model status saved."), "success");
  }
  async function removeProfile(id: string) {
    if (form.modelProfiles.length === 1) { announce(t("至少需要保留一个模型配置。", "At least one model profile must remain."), "error"); return; }
    const profiles = form.modelProfiles.filter((profile) => profile.id !== id);
    const activeModelId = form.activeModelId === id ? (profiles.find((profile) => profile.enabled)?.id ?? profiles[0]!.id) : form.activeModelId;
    await saveQueueRef.current;
    await saveSettingsChanges(form, { ...form, modelProfiles: profiles, activeModelId });
    setForm(await getSettings());
    setEditingProfile(null);
    announce(t("模型配置已删除并保存。", "Model profile deleted."), "success");
  }
  function connectionTestSettings(profile: ModelProfile): TranslatorSettings {
    return {
      ...form,
      modelProfiles: [...form.modelProfiles.filter((item) => item.id !== profile.id), profile],
      activeModelId: profile.id,
      provider: profile.provider,
      apiBaseUrl: profile.apiBaseUrl,
      apiKey: profile.apiKey,
      model: profile.model,
      temperature: profile.temperature,
      timeoutMs: profile.timeoutMs,
      maxOutputTokens: profile.maxOutputTokens,
      customHeaders: profile.customHeaders
    };
  }
  async function testProfile(profile: ModelProfile) {
    if (testingIds.has(profile.id)) return;
    setTestingIds(ids => new Set(ids).add(profile.id));
    clearTimeout(profileTestTimers.current.get(profile.id));
    setProfileTestMessages(messages => { const next = { ...messages }; delete next[profile.id]; return next; });
    const report = (text: string, kind: "success" | "error", code?: string) => {
      if (currentRevision !== sectionRevision.current) return;
      setProfileTestMessages(messages => ({ ...messages, [profile.id]: { text, kind, code } }));
      profileTestTimers.current.set(profile.id, setTimeout(() => {
        setProfileTestMessages(messages => { const next = { ...messages }; delete next[profile.id]; return next; });
        profileTestTimers.current.delete(profile.id);
      }, 4_000));
    };
    try {
      if ((!isMachine(profile.provider) && !profile.model.trim()) || (providerRequiresApiKey(profile.provider) && !profile.apiKey.trim()) || (profile.provider === "baidu" && !profile.appId?.trim())) {
        report(t("配置不完整，请检查模型名、密钥及服务必填参数。", "Configuration is incomplete. Check the model, key and required parameters."), "error", "configuration"); return;
      }
      const endpoint = validateApiUrl(profile.apiBaseUrl, en);
      if (!await ensureApiPermission(endpoint)) {
        report(t("未授予该模型地址的访问权限，无法测试。", "Access to this model endpoint was not granted; the test was skipped."), "error");
        return;
      }
      const response = await browser.runtime.sendMessage({ type: "test-connection", settings: connectionTestSettings({ ...profile, apiBaseUrl: endpoint }) }) as TestConnectionResponse;
      report(response.message, response.ok ? "success" : "error", response.code);
    } catch (error) {
      report(error instanceof Error ? error.message : t("测试失败。", "The test failed."), "error");
    } finally {
      setTestingIds(ids => { const next = new Set(ids); next.delete(profile.id); return next; });
      void loadModelUsage();
    }
  }
  async function testDraft() {
    if (!editingProfile || testingDraft) return;
    setModalMessage(null);
    const profileDraft = draftProfile();
    if (profileDraft.provider === "baidu" && !profileDraft.appId?.trim()) { setModalMessage({kind:"error",text:"请填写百度 App ID / Enter Baidu App ID"}); return; }
    const requiresKey = providerRequiresApiKey(profileDraft.provider);
    if ((!isMachine(profileDraft.provider) && !profileDraft.model.trim()) || !profileDraft.apiBaseUrl.trim() || (requiresKey && !profileDraft.apiKey.trim())) {
      setModalMessage({ kind: "error", text: requiresKey ? t("测试前请先填写模型名称、API 地址和 API Key。", "Enter the model name, API URL, and API key before testing.") : t("测试前请先填写模型名称和 API 地址。", "Enter the model name and API URL before testing.") });
      return;
    }
    try {
      profileDraft.apiBaseUrl = validateApiUrl(profileDraft.apiBaseUrl, en);
      profileDraft.customHeaders = sanitizeHeaders(profileDraft.customHeaders, en);
    } catch (error) {
      setModalMessage({ kind: "error", text: error instanceof Error ? error.message : t("模型配置无效。", "Invalid model configuration.") });
      return;
    }
    setTestingDraft(true);
    try {
      if (!await ensureApiPermission(profileDraft.apiBaseUrl)) {
        setModalMessage({ kind: "error", text: t("未授予该模型地址的访问权限，无法测试。", "Access to this model endpoint was not granted; the test was skipped.") });
        return;
      }
      const response = await browser.runtime.sendMessage({ type: "test-connection", settings: connectionTestSettings(profileDraft) }) as TestConnectionResponse;
      setModalMessage({ kind: response.ok ? "success" : "error", text: response.ok ? `${t("测试通过", "Test passed")}：${response.message}` : `${t("测试失败", "Test failed")}：${response.message}` });
    } catch (error) {
      setModalMessage({ kind: "error", text: error instanceof Error ? error.message : t("测试失败。", "The test failed.") });
    } finally { setTestingDraft(false); void loadModelUsage(); }
  }

  async function clearLocalData() {
    if (!window.confirm(t("确定清除翻译历史、缓存和使用量统计吗？模型配置不会删除。", "Clear translation history, cache, and usage statistics? Model profiles will be kept."))) return;
    await browser.runtime.sendMessage({ type: "clear-local-data" });
    setHistory([]); setModelUsage([]); announce(t("本地翻译数据已清除。", "Local translation data cleared."), "success");
  }

  async function resetAllSettings() {
    if (!window.confirm(t("这会删除全部模型配置、API Key、历史、缓存和使用量统计，并恢复默认设置。确定继续吗？", "This deletes all model profiles, API keys, history, cache, and usage statistics, then restores defaults. Continue?"))) return;
    await saveQueueRef.current;
    await browser.runtime.sendMessage({ type: "clear-local-data" });
    await Promise.all([pausedSites.setValue([]), disabledSites.setValue([])]);
    await saveSettings(DEFAULT_SETTINGS);
    await resetPrivacyNotices();
    setForm(await getSettings());
    setHistory([]);
    setModelUsage([]);
    announce(t("全部本地数据和密钥已删除，设置已恢复默认。", "All local data and keys were deleted, and defaults were restored."), "success");
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
        <button className={activeSection === "basic" ? "selected" : ""} onClick={() => selectSection("basic")}><span>01</span><div><strong>{t("基本信息", "General")}</strong><small>{t("界面、隐私与网站范围", "Interface, privacy, and sites")}</small></div></button>
        <button className={activeSection === "selection" ? "selected" : ""} onClick={() => selectSection("selection")}><span>02</span><div><strong>{t("划词翻译", "Selection")}</strong><small>{t("语言与翻译行为", "Languages and behavior")}</small></div></button>
        <button className={activeSection === "page" ? "selected" : ""} onClick={() => selectSection("page")}><span>03</span><div><strong>{t("全文翻译", "Page translation")}</strong><small>{t("全文模式与显示", "Page mode and appearance")}</small></div></button>
        <button className={activeSection === "longText" ? "selected" : ""} onClick={() => selectSection("longText")}><span>04</span><div><strong>{t("长文本翻译", "Long text")}</strong><small>{t("侧边栏翻译参数", "Side panel settings")}</small></div></button>
        <button className={activeSection === "prompts" ? "selected" : ""} onClick={() => selectSection("prompts")}><span>05</span><div><strong>{t("提示词设置", "Prompts")}</strong><small>{t("按场景配置提示词", "Prompts by scene")}</small></div></button>
        <button className={activeSection === "models" ? "selected" : ""} onClick={() => selectSection("models")}><span>06</span><div><strong>{t("模型服务", "Models")}</strong><small>{t("API 与模型管理", "API and model management")}</small></div></button>
        <button className={activeSection === "history" ? "selected" : ""} onClick={() => selectSection("history")}><span>07</span><div><strong>{t("翻译历史", "History")}</strong><small>{t("搜索与收藏记录", "Search and favorites")}</small></div></button>
        <button className={activeSection === "data" ? "selected" : ""} onClick={() => selectSection("data")}><span>08</span><div><strong>{t("配置管理", "Data")}</strong><small>{t("导入与导出设置", "Import and export")}</small></div></button>
      </aside>
      <div className="settings-content">
      {activeSection === "basic" && <section className="card">
        <div className="section-head"><div><span className="step">01</span><h2>{t("基本信息设置", "General settings")}</h2><p>{t("设置界面语言、隐私和网站范围。", "Configure interface language, privacy, and site access.")}</p></div></div>
        <div className="grid">
          <label>{t("界面语言", "Interface language")}<select value={form.uiLanguage} onChange={(event) => update("uiLanguage", event.target.value as TranslatorSettings["uiLanguage"])}><option value="zh-CN">简体中文</option><option value="en">English</option></select></label>
        </div>
        <ShortcutStatus en={en} />
        {privacyNotice.accepted === false && <div className="privacy-disclosure"><strong>{t("数据处理说明", "Data handling notice")}</strong><p>{t("你选择、输入或通过全文翻译提交的文字会发送到当前服务；主动开启自动全文模式后，进入符合规则的页面时会发送正文；页面标题和地址仅在开启历史时保存在本地。开发者不接收这些数据。请勿翻译密码、支付、医疗等敏感信息。", "Selected or entered text is sent to your configured model service. Page titles and URLs are stored locally only when history is enabled. The developer does not receive this data. Do not translate passwords, payment, health, or other sensitive information.")}</p><button type="button" disabled={confirmingPrivacy} onClick={confirmPrivacy}>{t("了解并同意", "Understand and agree")}</button></div>}
        <div className="toggle-grid">
          <label className="toggle"><input type="checkbox" checked={form.enableHistory} onChange={(event) => update("enableHistory", event.target.checked)} /><span><strong>{t("保存翻译历史", "Save translation history")}</strong><small>{t("最多保存最近 100 条", "Keep up to 100 recent entries")}</small></span></label>
          <label className="toggle"><input type="checkbox" checked={form.enableCache} onChange={(event) => update("enableCache", event.target.checked)} /><span><strong>{t("启用翻译缓存", "Enable translation cache")}</strong><small>{t("相同请求 7 天内复用", "Reuse identical requests for 7 days")}</small></span></label>
        </div>
        <div className="model-routing compact-routing">
          <Toggle label={t("按翻译功能分别设置服务", "Assign services by feature")} checked={form.separateModels} onChange={value => update("separateModels", value)} />
          <p className="ft-help">{form.separateModels ? t("三个翻译功能可在各自设置页选择不同服务；未指定时跟随默认服务。", "Each translation feature can choose its own service; unassigned features follow the default.") : t("三个翻译功能共用模型服务页面设置的默认服务。", "All three translation features use the default from Model services.")}</p>
          <p className="model-routing-default">{t("当前默认服务", "Current default service")} · <strong>{form.modelProfiles.find(profile => profile.id === form.activeModelId)?.name}</strong></p>
        </div>
        <label>{t("网站访问模式", "Site access mode")}<select value={form.siteAccessMode} onChange={(event) => update("siteAccessMode", event.target.value as TranslatorSettings["siteAccessMode"])}><option value="blacklist">{t("除黑名单外全部启用", "Enable except blocked sites")}</option><option value="whitelist">{t("仅在白名单网站启用", "Enable only on allowed sites")}</option></select></label>
        {form.siteAccessMode === "blacklist"
          ? <label>{t("禁用网站", "Blocked sites")}<textarea rows={3} value={form.blockedSites.join("\n")} onChange={(event) => update("blockedSites", event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))} placeholder={"bank.example.com\n*.private.example.com"} /><small>{t("每行一个域名，同时匹配其子域名。已内置常见银行、支付和密码管理器站点，可自行增删。", "One domain per line; subdomains are included. Common banking, payment, and password-manager sites are built in and can be adjusted freely.")}</small></label>
          : <label>{t("允许网站", "Allowed sites")}<textarea rows={3} value={form.allowedSites.join("\n")} onChange={(event) => update("allowedSites", event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))} placeholder={"docs.example.com\n*.company.example.com"} /><small>{t("白名单为空时所有网站均不启用。", "No site is enabled when this list is empty.")}</small></label>}
      </section>}

      {activeSection === "selection" && <FeatureTranslationSettings feature="selection" step="02" form={form} patch={patchForm} />}

      {activeSection === "page" && <FeatureTranslationSettings feature="page" step="03" form={form} patch={patchForm} />}

      {activeSection === "longText" && <FeatureTranslationSettings feature="longText" step="04" form={form} patch={patchForm} />}

      {activeSection === "prompts" && <PromptSettings form={form} updateScenePrompt={updateScenePrompt} copyScenePrompt={copyScenePrompt} restoreScenePrompt={restoreScenePrompt} restoreAllScenePrompts={restoreAllScenePrompts} update={update} />}

      {activeSection === "models" && <section className="card">
        <div className="section-head model-head"><div><span className="step">06</span><h2>{t("翻译服务配置", "Translation services")}</h2><p>{t("添加和维护可用服务，并设置默认服务；各功能的绑定在对应翻译设置页完成。", "Add and maintain services and choose the default; assign them from each translation feature page.")}</p></div><button type="button" className="add" onClick={addProfile}>＋ {t("添加服务", "Add service")}</button></div>
        <ModelCards form={form} modelUsage={modelUsage} formatCount={formatCount} resetModelUsage={resetModelUsage} profileTestMessages={profileTestMessages} testingIds={testingIds} update={update} testProfile={testProfile} editProfile={editProfile} toggleProfile={toggleProfile} />
        <label className="key-storage-setting">{t("API Key 保存方式", "API key storage mode")}
          <select value={form.keyStorage} onChange={(event) => update("keyStorage", event.target.value as KeyStorageMode)}>
            <option value="local">{t("本地保存（长期使用）", "Local storage (persistent)")}</option>
            <option value="session">{t("会话保存（关闭浏览器后清除）", "Session storage (cleared when the browser closes)")}</option>
          </select>
          <small>{form.keyStorage === "session"
            ? t("会话模式下 API Key 保存在浏览器会话存储中，关闭浏览器后需要重新填写；切换保存方式会立即迁移已填写的 Key。", "In session mode API keys live in browser session storage and must be re-entered after the browser closes. Switching modes migrates existing keys immediately.")
            : t("本地模式便于长期使用；如果希望缩小密钥暴露窗口，可切换为会话保存。", "Local mode is convenient for long-term use; switch to session storage to shrink the exposure window of your keys.")}</small>
        </label>
        <p className="warning">{form.keyStorage === "session"
          ? t("API Key 保存在浏览器会话存储中，关闭浏览器即清除；扩展存储不是系统级密钥保险箱。", "API keys are kept in browser session storage and cleared when the browser closes; extension storage is not a system-level secret vault.")
          : t("API Key 保存在浏览器扩展的本地存储中，本地存储不是系统级密钥保险箱。", "API keys are stored in extension-local storage, which is not a system-level secret vault.")}</p>
      </section>}

      {activeSection === "history" && <section className="card">
        <div className="section-head history-head"><div><span className="step">07</span><h2>{t("翻译历史", "Translation history")}</h2><p>{t("记录保存在当前浏览器本地，最多保留最近 100 条。", "Entries are stored in this browser, up to 100 recent items.")}</p></div><button type="button" className="danger-action" disabled={!history.length} onClick={clearAllHistory}>{t("清空历史", "Clear history")}</button></div>
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
        <div className="section-head"><div><span className="step">08</span><h2>{t("配置管理", "Configuration management")}</h2><p>{t("在浏览器或设备之间迁移翻译设置和模型服务。", "Move translation settings and model providers between browsers or devices.")}</p></div></div>
        <div className="data-actions">
          <article><div><strong>{t("导出安全配置", "Export safe configuration")}</strong><p>{t("默认不导出 API Key 和自定义请求头；含密钥导出为完整备份，始终包含网站规则。", "API keys and custom headers are excluded by default; the with-secrets export is a full backup and always includes website rules.")}</p><Toggle label={t("导出包含网站规则", "Include website rules in export")} checked={includeWebsiteRules} onChange={setIncludeWebsiteRules} /></div><span className="export-buttons"><button type="button" onClick={() => exportConfiguration(false)}>{t("导出（不含密钥）", "Export without secrets")}</button><button type="button" onClick={() => exportConfiguration(true)}>{t("导出（包含密钥）", "Export with secrets")}</button></span></article>
          <article><div><strong>{t("导入完整配置", "Import full configuration")}</strong><p>{t("选择 JSON 文件后点击“导入并启用”，一次性申请已启用模型的接口权限并覆盖当前配置。", "Choose a JSON file, then Import and enable to grant endpoint access for enabled models and replace the current configuration.")}</p></div><label className="import-button">{t("选择文件", "Choose file")}<input type="file" accept="application/json,.json" disabled={importing} onChange={importConfiguration} /></label></article>
          {pendingImport && <div className="import-preview">
            <strong>{pendingImport.name}</strong>
            <p>{t("已读取模型配置：", "Model profiles loaded: ")}{pendingImport.settings.modelProfiles.length}{t(" 个。授权成功后导入；拒绝授权不会覆盖当前配置。", ". Import proceeds after permission is granted; declining keeps your current configuration.")}</p>
            <p>{t("仅向配置的接口发送翻译请求，仍需有效密钥和可用服务。启用自动翻译的配置可能在导入后开始翻译符合条件的页面。", "Translation requests go to the configured endpoints; valid credentials and available services are still required. Automatic mode may begin translating eligible pages after import.")}</p>
            {!form.privacyConsentAccepted && <label className="import-consent"><input type="checkbox" checked={importConsent} disabled={importing} onChange={event => setImportConsent(event.target.checked)} /><span>{t("我了解并同意：划词、输入或网页正文及必要语言信息会发送到配置的第三方翻译服务；全文会包含最小行内格式，开发者不接收这些内容。", "I understand and agree: selected, entered or webpage text and necessary language information are sent to configured third-party translation services; page translation includes minimal inline formatting. The developer does not receive this content.")}</span></label>}
            <div className="import-preview-actions"><button type="button" className="save-model" disabled={importing || (!form.privacyConsentAccepted && !importConsent)} onClick={importAndEnable}>{importing ? t("正在导入…", "Importing…") : t("导入并启用", "Import and enable")}</button><button type="button" disabled={importing} onClick={() => { importRevision.current++; setPendingImport(null); setImportConsent(false); }}>{t("取消", "Cancel")}</button></div>
          </div>}
          <article><div><strong>{t("清除本地翻译数据", "Clear local translation data")}</strong><p>{t("删除历史、缓存和使用量统计，保留模型配置。", "Delete history, cache, and usage statistics while keeping model profiles.")}</p></div><button type="button" onClick={clearLocalData}>{t("清除数据", "Clear data")}</button></article>
          <article><div><strong>{t("删除全部本地数据", "Delete all local data")}</strong><p>{t("删除模型配置、API Key、历史、缓存和统计，并撤销数据处理同意。", "Delete model profiles, API keys, history, cache, and statistics, and revoke data-processing consent.")}</p></div><button type="button" className="danger-action" onClick={resetAllSettings}>{t("删除并重置", "Delete and reset")}</button></article>
        </div>
        <p className="secret-warning"><strong>{t("敏感信息提醒：", "Sensitive information: ")}</strong>{t("选择“包含密钥”时，导出文件会包含模型 API Key。不要上传到公开仓库、共享目录或发送给不可信的人。", "When exporting with secrets, the file contains model API keys. Do not upload it publicly or share it with untrusted people.")}</p>
      </section>}
      {notice && <div className={`standalone-notice ${noticeKind}`} role={noticeKind === "error" ? "alert" : "status"}>{notice}</div>}
      </div>
    </div>
    {editingProfile && <div className="modal-backdrop" onMouseDown={() => setEditingProfile(null)}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={t("模型设置", "Model settings")} onMouseDown={(event) => event.stopPropagation()}>
        <header><div><h2>{form.modelProfiles.some((profile) => profile.id === editingProfile.id) ? t("编辑模型", "Edit model") : t("添加服务", "Add service")}</h2><p>{t("配置云端兼容服务或本地推理服务。", "Configure a cloud or local inference service.")}</p></div><button type="button" onClick={() => setEditingProfile(null)}>×</button></header>
        <div className="modal-body">
          <div className="grid"><label>{t("服务类型", "Provider type")}<select value={editingProfile.provider} onChange={(event) => { const provider = event.target.value as ProviderType; const definition = findProviderPreset(provider); setEditingProfile({ ...editingProfile, provider, apiBaseUrl: definition.defaultUrl, authMode: provider === "anthropic" ? "x-api-key" : "bearer" }); }}>{PROVIDER_PRESETS.map((provider) => <option key={provider.id} value={provider.id}>{providerDisplayName(provider.id, en)}</option>)}</select></label><label>{t("配置名称", "Profile name")}<input value={editingProfile.name} onChange={(event) => setEditingProfile({ ...editingProfile, name: event.target.value })} placeholder={t("例如：本地推理服务", "For example: Local inference")} /></label></div>
          {!isMachine(editingProfile.provider) && <label>{t("模型名称", "Model name")}<input value={editingProfile.model} onChange={(event) => setEditingProfile({ ...editingProfile, model: event.target.value })} placeholder={en ? findProviderPreset(editingProfile.provider).englishModelPlaceholder : findProviderPreset(editingProfile.provider).modelPlaceholder} /></label>}
          {editingProfile.provider === "baidu" && <label>App ID<input value={editingProfile.appId ?? ""} onChange={e=>setEditingProfile({...editingProfile,appId:e.target.value})}/></label>}
          {editingProfile.provider === "microsoft" && <label>Region<input value={editingProfile.region ?? ""} onChange={e=>setEditingProfile({...editingProfile,region:e.target.value})}/><small>{t("区域资源需要填写 Region；全局资源可留空。", "Region is required for regional resources; global resources can omit it.")}</small></label>}
          <label>API Base URL<input value={editingProfile.apiBaseUrl} onChange={(event) => setEditingProfile({ ...editingProfile, apiBaseUrl: event.target.value })} placeholder="https://api.openai.com/v1" /><small>{t("云端服务需使用 HTTPS；局域网内的模型服务可以使用 HTTP（如 http://192.168.1.50:11434/v1、http://nas.local:8000/v1）。保存或测试时，扩展会请求访问该 API 地址，仅用于发送模型翻译请求，不会读取该网站内容。", "Cloud services must use HTTPS; model services on your local network may use HTTP (e.g. http://192.168.1.50:11434/v1 or http://nas.local:8000/v1). When saving or testing, the extension requests access to this API endpoint only to send model translation requests; it does not read that website's content.")}</small></label>
          <label>API Key{!providerRequiresApiKey(editingProfile.provider) && t("（可选）", " (optional)")}<input type="password" autoComplete="new-password" value={editingProfile.apiKey} onChange={(event) => setEditingProfile({ ...editingProfile, apiKey: event.target.value })} placeholder={providerRequiresApiKey(editingProfile.provider) ? "API Key" : t("本地服务通常无需填写", "Usually not required for local services")} /></label>
          {editingProfile.provider === "anthropic" && <label>{t("鉴权方式", "Authentication")}<select value={editingProfile.authMode} onChange={(event) => setEditingProfile({ ...editingProfile, authMode: event.target.value as ModelProfile["authMode"] })}><option value="x-api-key">x-api-key（Anthropic 官方）</option><option value="bearer">Authorization Bearer（常见第三方）</option><option value="both">{t("同时发送（仅兼容需要时）", "Send both (compatibility only)")}</option></select></label>}
          <div className="grid"><label hidden={isMachine(editingProfile.provider)}>Temperature<input type="number" min="0" max="2" step="0.1" value={editingProfile.temperature} onChange={(event) => setEditingProfile({ ...editingProfile, temperature: Number(event.target.value) })} /></label><label>{t("超时时间（秒）", "Timeout (seconds)")}<input type="number" min="5" max="300" value={editingProfile.timeoutMs / 1000} onChange={(event) => setEditingProfile({ ...editingProfile, timeoutMs: Number(event.target.value) * 1000 })} /></label><label hidden={isMachine(editingProfile.provider)}>{t("最大输出 Token", "Maximum output tokens")}<input type="number" min="64" max="131072" value={editingProfile.maxOutputTokens} onChange={(event) => setEditingProfile({ ...editingProfile, maxOutputTokens: Number(event.target.value) })} /></label></div>
          <details className="model-advanced"><summary>{t("高级设置", "Advanced settings")}</summary><label>{t("最大并发请求数", "Maximum concurrent requests")}<input type="number" min="1" max="6" step="1" value={editingProfile.maxConcurrency ?? 2} onChange={event => setEditingProfile({ ...editingProfile, maxConcurrency: Number(event.target.value) })} /><small>{t("默认 2，可设置 1–6。划词与全文翻译共用上限；遇到限流自动退避。百度翻译最多同时请求 1 次。", "Default 2, range 1–6. Selection and page translation share this limit with automatic rate-limit backoff. Baidu allows at most 1 concurrent request.")}</small></label></details>
          <label hidden={isMachine(editingProfile.provider)}>{t("自定义请求头", "Custom headers")}<textarea rows={3} value={headersDraft} onChange={(event) => setHeadersDraft(event.target.value)} placeholder={"X-Organization: example\nX-Custom-Key: value"} /><small>{t("每行一个 Header，格式为“名称: 值”。同名项可以覆盖默认请求头。", "One header per line in Name: Value format. Matching names override default headers.")}</small></label>
          <label className="modal-toggle"><input type="checkbox" checked={editingProfile.enabled} onChange={(event) => setEditingProfile({ ...editingProfile, enabled: event.target.checked })} /><span>{t("启用此模型", "Enable this model")}</span></label>
        </div>
        {modalMessage && <div className={`modal-message ${modalMessage.kind}`} role={modalMessage.kind === "error" ? "alert" : "status"}>{modalMessage.text}</div>}
        <footer>{form.modelProfiles.some((profile) => profile.id === editingProfile.id) && <button type="button" className="delete-model" onClick={() => removeProfile(editingProfile.id)}>{t("删除模型", "Delete model")}</button>}<span /><button type="button" className="test-model" disabled={testingDraft} onClick={testDraft}>{testingDraft ? t("测试中…", "Testing…") : t("测试连接", "Test connection")}</button><button type="button" className="cancel" onClick={() => setEditingProfile(null)}>{t("取消", "Cancel")}</button><button type="button" className="save-model" onClick={saveProfileDraft}>{t("保存模型", "Save model")}</button></footer>
      </section>
    </div>}
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
