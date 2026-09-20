import React, { useMemo, useState } from "react";
import { requestApiPermissions } from "../../../shared/api-permissions";
import { isMachine } from "../../../shared/provider-list";
import { DEFAULT_PROMPT_STYLES, DEFAULT_SCENE_PROMPTS, type PromptStyle, type TranslatorSettings } from "../../../shared/types";

interface GeneratePromptResponse { ok?: boolean; prompt?: string; message?: string }
interface PromptDraft extends PromptStyle {
  prompt: string;
  mode: "manual" | "generate";
  generatorId: string;
  requirements: string;
  isNew: boolean;
}

export function PromptSettings({ form, patch }: { form: TranslatorSettings; patch: (changes: Partial<TranslatorSettings>) => void }) {
  const en = form.uiLanguage === "en";
  const t = (zh: string, english: string) => en ? english : zh;
  const llmProfiles = useMemo(() => form.modelProfiles.filter(profile => profile.enabled && !isMachine(profile.provider)), [form.modelProfiles]);
  const defaultGenerator = llmProfiles.some(profile => profile.id === form.activeModelId) ? form.activeModelId : (llmProfiles[0]?.id ?? "");
  const [draft, setDraft] = useState<PromptDraft | null>(null);
  const [generating, setGenerating] = useState(false);
  const [editorMessage, setEditorMessage] = useState<{ text: string; error: boolean }>();

  const saveStyles = (styles: PromptStyle[], prompts = form.scenePrompts) => {
    const ids = new Set(styles.map(style => style.id));
    const fallback = styles[0]!.id;
    const featurePreferences = Object.fromEntries(Object.entries(form.featurePreferences).map(([feature, preferences]) => [
      feature, { ...preferences, translationScene: ids.has(preferences.translationScene) ? preferences.translationScene : fallback }
    ])) as TranslatorSettings["featurePreferences"];
    patch({ promptStyles: styles, scenePrompts: prompts, featurePreferences, translationScene: ids.has(form.translationScene) ? form.translationScene : fallback });
  };

  const openEditor = (style?: PromptStyle) => {
    const id = style?.id ?? `style-${crypto.randomUUID()}`;
    setEditorMessage(undefined);
    setDraft({ id, name: style?.name ?? "", description: style?.description ?? "", prompt: style ? (form.scenePrompts[id] ?? "") : "", mode: "manual", generatorId: defaultGenerator, requirements: "", isNew: !style });
  };

  const saveDraft = () => {
    if (!draft) return;
    const name = draft.name.trim();
    const prompt = draft.prompt.trim();
    if (!name || !prompt) {
      setEditorMessage({ text: t("请填写风格名称和提示词内容。", "Enter a style name and prompt."), error: true });
      return;
    }
    const style = { id: draft.id, name: name.slice(0, 100), description: draft.description.trim().slice(0, 300) };
    const styles = draft.isNew ? [...form.promptStyles, style] : form.promptStyles.map(item => item.id === draft.id ? style : item);
    saveStyles(styles, { ...form.scenePrompts, [draft.id]: prompt.slice(0, 20_000) });
    setDraft(null);
  };

  const deleteStyle = (id: string) => {
    if (form.promptStyles.length <= 1 || !window.confirm(t("确定删除这个翻译风格吗？", "Delete this translation style?"))) return;
    const prompts = { ...form.scenePrompts };
    delete prompts[id];
    saveStyles(form.promptStyles.filter(style => style.id !== id), prompts);
  };

  const restoreDefaults = () => {
    if (!window.confirm(t("确定恢复四种内置风格并移除自定义风格吗？", "Restore the four built-in styles and remove custom styles?"))) return;
    saveStyles(DEFAULT_PROMPT_STYLES.map(style => ({ ...style })), { ...DEFAULT_SCENE_PROMPTS });
  };

  async function generate() {
    if (!draft || generating) return;
    const profile = llmProfiles.find(item => item.id === draft.generatorId);
    if (!draft.name.trim() || !draft.description.trim()) {
      setEditorMessage({ text: t("大模型生成需要填写风格名称和风格说明。", "LLM generation requires a style name and description."), error: true });
      return;
    }
    if (!profile) {
      setEditorMessage({ text: t("请选择已启用的大模型。", "Select an enabled LLM service."), error: true });
      return;
    }
    setGenerating(true); setEditorMessage(undefined);
    try {
      if (!await requestApiPermissions([profile.apiBaseUrl])) throw new Error(t("未授予该模型地址的访问权限。", "Access to this model endpoint was not granted."));
      const response = await browser.runtime.sendMessage({ type: "generate-prompt", profileId: profile.id, name: draft.name, description: draft.description, currentPrompt: draft.prompt, requirements: draft.requirements }) as GeneratePromptResponse;
      if (!response?.ok || !response.prompt) throw new Error(response?.message || t("提示词生成失败。", "Prompt generation failed."));
      setDraft(current => current ? { ...current, prompt: response.prompt! } : current);
      setEditorMessage({ text: t("提示词已生成，请确认内容后保存。", "Prompt generated. Review it before saving."), error: false });
    } catch (error) {
      setEditorMessage({ text: error instanceof Error ? error.message : t("提示词生成失败。", "Prompt generation failed."), error: true });
    } finally { setGenerating(false); }
  }

  return <section className="card">
    <div className="section-head"><div><span className="step">05</span><h2>{t("提示词设置", "Prompt settings")}</h2><p>{t("通过统一编辑窗口维护翻译风格，可手动编写或使用已配置的大模型生成。", "Manage translation styles in one editor, either manually or with a configured LLM.")}</p></div><div className="prompt-head-actions"><button type="button" className="reset-all" disabled={form.promptStyles.length >= 50} onClick={() => openEditor()}>＋ {t("添加风格", "Add style")}</button><button type="button" className="reset-all" onClick={restoreDefaults}>{t("恢复内置风格", "Restore built-ins")}</button></div></div>
    <p className="template-help">{t("支持变量：", "Available variables: ")}<code>{"{{sourceLanguage}}"}</code>、<code>{"{{targetLanguage}}"}</code>、<code>{"{{outputMode}}"}</code>、<code>{"{{scene}}"}</code></p>
    <div className="prompt-list">
      {form.promptStyles.map(style => {
        const prompt = form.scenePrompts[style.id] ?? "";
        return <article className="prompt-item" key={style.id}>
          <div className="prompt-card-head"><div><strong>{style.name}</strong><p>{style.description || t("暂无风格说明", "No description")}</p></div><span>{prompt.length} {t("字符", "characters")}</span></div>
          <p className="prompt-preview">{prompt || t("尚未填写提示词", "No prompt entered")}</p>
          <div className="prompt-actions"><button type="button" onClick={() => openEditor(style)}>{t("编辑", "Edit")}</button><button type="button" onClick={() => void navigator.clipboard.writeText(prompt)}>{t("复制", "Copy")}</button><button type="button" className="delete-prompt" disabled={form.promptStyles.length <= 1} onClick={() => deleteStyle(style.id)}>{t("删除", "Delete")}</button></div>
        </article>;
      })}
    </div>
    <label>{t("基础系统提示词", "Base system prompt")}<textarea rows={4} value={form.systemPrompt} maxLength={20_000} onChange={event => patch({ systemPrompt: event.target.value })} /><small>{t("所有风格都会使用，用于约束翻译任务和安全边界。", "Used for every style to define the translation task and safety boundary.")}</small></label>
    <p className="prompt-footnote">{t("提示词可随时编辑，仅用于大模型翻译；百度、谷歌和必应等机器翻译服务不会使用这些提示词。", "Prompts can be edited at any time and apply only to LLM translation. Machine translation services such as Baidu, Google, and Bing do not use them.")}</p>

    {draft && <div className="modal-backdrop" onMouseDown={() => { if (!generating) setDraft(null); }}>
      <section className="modal prompt-editor" role="dialog" aria-modal="true" aria-label={draft.isNew ? t("添加提示词风格", "Add prompt style") : t("编辑提示词风格", "Edit prompt style")} onMouseDown={event => event.stopPropagation()}>
        <header><div><h2>{draft.isNew ? t("添加提示词风格", "Add prompt style") : t("编辑提示词风格", "Edit prompt style")}</h2><p>{t("选择手动输入，或让大模型根据风格信息生成提示词。", "Enter a prompt manually or generate one from the style details.")}</p></div><button type="button" disabled={generating} onClick={() => setDraft(null)}>×</button></header>
        <div className="modal-body">
          <div className="ft-mode-buttons prompt-mode-buttons"><button type="button" aria-pressed={draft.mode === "manual"} onClick={() => setDraft({ ...draft, mode: "manual" })}>{t("手动输入", "Manual input")}</button><button type="button" aria-pressed={draft.mode === "generate"} onClick={() => setDraft({ ...draft, mode: "generate" })}>{t("大模型生成", "Generate with LLM")}</button></div>
          <div className="grid"><label>{t("风格名称", "Style name")}<input autoFocus value={draft.name} maxLength={100} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label><label>{t("风格说明", "Description")}<input value={draft.description} maxLength={300} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label></div>
          {draft.mode === "generate" && <div className="prompt-generate-fields"><label>{t("生成提示词使用的大模型", "LLM used to generate prompts")}<select value={draft.generatorId} disabled={!llmProfiles.length || generating} onChange={event => setDraft({ ...draft, generatorId: event.target.value })}>{llmProfiles.length ? llmProfiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name} · {profile.model}</option>) : <option value="">{t("暂无可用大模型", "No LLM service available")}</option>}</select></label><label>{t("补充生成要求（可选）", "Additional requirements (optional)")}<input value={draft.requirements} maxLength={2_000} onChange={event => setDraft({ ...draft, requirements: event.target.value })} placeholder={t("例如：适合游戏本地化，保留角色语气", "For example: preserve character voice for game localization")} /></label><button type="button" className="generate-prompt" disabled={generating || !llmProfiles.length} onClick={() => void generate()}>{generating ? t("生成中…", "Generating…") : t("生成提示词", "Generate prompt")}</button></div>}
          <label>{t("提示词内容", "Prompt content")}<textarea rows={9} maxLength={20_000} value={draft.prompt} onChange={event => setDraft({ ...draft, prompt: event.target.value })} placeholder={t("输入提示词，或使用大模型生成后在此调整", "Enter a prompt, or generate one and refine it here")} /></label>
        </div>
        {editorMessage && <div className={`modal-message ${editorMessage.error ? "error" : "success"}`} role={editorMessage.error ? "alert" : "status"}>{editorMessage.text}</div>}
        <footer><span /><button type="button" className="cancel" disabled={generating} onClick={() => setDraft(null)}>{t("取消", "Cancel")}</button><button type="button" className="save-model" disabled={generating} onClick={saveDraft}>{t("保存提示词", "Save prompt")}</button></footer>
      </section>
    </div>}
  </section>;
}
