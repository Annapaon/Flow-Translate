import React, { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { getSettings, saveSettings } from "../../shared/settings";
import { DEFAULT_SETTINGS, type TestConnectionResponse, type TranslatorSettings } from "../../shared/types";
import "./style.css";

function App() {
  const [form, setForm] = useState<TranslatorSettings>(DEFAULT_SETTINGS);
  const [notice, setNotice] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => { getSettings().then(setForm); }, []);

  function update<K extends keyof TranslatorSettings>(key: K, value: TranslatorSettings[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function persist(event?: FormEvent) {
    event?.preventDefault();
    setNotice("");
    try {
      await saveSettings(form);
      setNotice("设置已保存，可以打开网页进行划词翻译。");
      if (event) window.setTimeout(() => window.close(), 120);
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? `保存失败：${error.message}` : "保存失败");
      return false;
    }
  }

  async function runTest() {
    setTesting(true);
    setNotice("正在测试模型连接…");
    try {
      if (!await persist()) return;
      const response = await browser.runtime.sendMessage({ type: "test-connection", settings: form }) as TestConnectionResponse;
      setNotice(response.message);
    } finally {
      setTesting(false);
    }
  }

  return <main className="page">
    <header className="hero">
      <div className="logo">译</div>
      <div>
        <h1>流式划词翻译</h1>
        <p>选择网页文字，通过你自己的大模型 API 进行翻译。</p>
      </div>
    </header>

    <form onSubmit={persist}>
      <section className="card">
        <div className="section-head">
          <div><h2>模型服务</h2><p>首版支持 OpenAI-compatible Chat Completions API。</p></div>
          <span className="badge">OpenAI Compatible</span>
        </div>

        <label>API Base URL
          <input value={form.apiBaseUrl} onChange={(e) => update("apiBaseUrl", e.target.value)} placeholder="https://api.openai.com/v1" required />
          <small>可填写 OpenAI、DeepSeek、Moonshot、Ollama 或 LM Studio 的兼容地址。</small>
        </label>
        <div className="grid">
          <label>API Key
            <input type="password" value={form.apiKey} onChange={(e) => update("apiKey", e.target.value)} placeholder="sk-..." required />
          </label>
          <label>模型名称
            <input value={form.model} onChange={(e) => update("model", e.target.value)} placeholder="gpt-4.1-mini" required />
          </label>
        </div>
        <p className="warning">API Key 保存在浏览器扩展的本地存储中，不会由本扩展上传到其他服务器，但本地存储不是系统级密钥保险箱。</p>
      </section>

      <section className="card">
        <div className="section-head"><div><h2>翻译偏好</h2><p>控制触发方式、目标语言和文本范围。</p></div></div>
        <div className="grid">
          <label>目标语言
            <select value={form.targetLanguage} onChange={(e) => update("targetLanguage", e.target.value)}>
              <option>简体中文</option><option>繁體中文</option><option>English</option><option>日本語</option><option>한국어</option><option>Français</option><option>Deutsch</option><option>Español</option>
            </select>
          </label>
          <label>触发方式
            <select value={form.triggerMode} onChange={(e) => update("triggerMode", e.target.value as "click" | "auto")}>
              <option value="click">点击圆点翻译</option><option value="auto">选择后自动翻译</option>
            </select>
          </label>
          <label>思考过程
            <select value={form.enableThinking ? "on" : "off"} onChange={(e) => update("enableThinking", e.target.value === "on")}>
              <option value="off">关闭（默认）</option><option value="on">开启并显示</option>
            </select>
            <small>需模型支持 reasoning_content；翻译完成后自动收起。</small>
          </label>
          <label>最少字符数
            <input type="number" min="1" max="100" value={form.minChars} onChange={(e) => update("minChars", Number(e.target.value))} />
          </label>
          <label>最多字符数
            <input type="number" min="100" max="20000" value={form.maxChars} onChange={(e) => update("maxChars", Number(e.target.value))} />
          </label>
          <label>Temperature
            <input type="number" min="0" max="2" step="0.1" value={form.temperature} onChange={(e) => update("temperature", Number(e.target.value))} />
          </label>
          <label>超时时间（秒）
            <input type="number" min="5" max="300" value={form.timeoutMs / 1000} onChange={(e) => update("timeoutMs", Number(e.target.value) * 1000)} />
          </label>
        </div>
        <label>系统提示词
          <textarea rows={5} value={form.systemPrompt} onChange={(e) => update("systemPrompt", e.target.value)} />
        </label>
      </section>

      <div className="toolbar">
        <span className="notice">{notice}</span>
        <button type="button" className="secondary" onClick={runTest} disabled={testing}>{testing ? "测试中…" : "测试连接"}</button>
        <button type="submit" className="primary">保存设置</button>
      </div>
    </form>

    <section className="tips">
      <strong>使用方法</strong>
      <ol><li>填写并保存模型配置。</li><li>刷新已经打开的网页。</li><li>选择文字，点击紫色圆点；也可以按 Alt+T 或使用右键菜单。</li></ol>
    </section>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
