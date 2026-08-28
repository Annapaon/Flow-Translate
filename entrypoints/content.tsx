import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { getSettings, watchSettings } from "../shared/settings";
import type { ServerMessage, TranslatorSettings } from "../shared/types";
import { DEFAULT_SETTINGS } from "../shared/types";

interface SelectionSnapshot {
  text: string;
  x: number;
  y: number;
}

interface Point {
  left: number;
  top: number;
}

type ViewStatus = "idle" | "loading" | "streaming" | "done" | "error";

const styles = `
  :host { all: initial; color-scheme: light dark; }
  * { box-sizing: border-box; }
  .trigger { position: fixed; z-index: 2147483646; width: 20px; height: 20px; border: 2px solid rgba(255,255,255,.92); border-radius: 999px; padding: 0; cursor: pointer; background: linear-gradient(135deg,#6366f1,#8b5cf6); box-shadow: 0 4px 13px rgba(30,41,59,.32); }
  .trigger:hover { transform: scale(1.08); }
  .card { position: fixed; z-index: 2147483647; width: min(390px, calc(100vw - 24px)); max-height: min(460px, calc(100vh - 24px)); overflow: hidden; border: 1px solid rgba(148,163,184,.35); border-radius: 14px; color: #172033; background: rgba(255,255,255,.98); box-shadow: 0 18px 55px rgba(15,23,42,.28); font: 14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
  .head { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid #e5e7eb; cursor:move; user-select:none; touch-action:none; }
  .brand { display:flex; align-items:center; gap:8px; font-weight:700; }
  .dot { width:9px; height:9px; border-radius:50%; background:#7c3aed; box-shadow:0 0 0 4px #ede9fe; }
  .actions { display:flex; gap:4px; }
  .icon { border:0; border-radius:7px; padding:5px 8px; cursor:pointer; color:#475569; background:transparent; font:13px system-ui,sans-serif; }
  .icon:hover { background:#f1f5f9; }
  .body { max-height:390px; overflow:auto; padding:13px 14px 15px; }
  .field { margin-bottom:11px; }
  .field:last-child { margin-bottom:0; }
  .label { margin:0 0 5px 2px; color:#64748b; font-size:11px; font-weight:700; letter-spacing:.06em; }
  .source,.result { padding:10px 11px; overflow:auto; border:1px solid #e2e8f0; border-radius:9px; white-space:pre-wrap; word-break:break-word; user-select:text; }
  .source { max-height:100px; color:#64748b; background:#f8fafc; font-size:12px; }
  .result { min-height:55px; max-height:180px; color:#172033; background:#fff; }
  .thinking { margin-bottom:10px; overflow:hidden; border:1px solid #ddd6fe; border-radius:8px; background:#faf8ff; }
  .thinking-head { display:flex; justify-content:space-between; width:100%; border:0; padding:7px 10px; cursor:pointer; color:#6d28d9; background:#f3efff; font:600 12px system-ui,sans-serif; }
  .thinking-body { max-height:120px; overflow:auto; padding:9px 10px; color:#756b85; font-size:12px; white-space:pre-wrap; word-break:break-word; }
  .placeholder { color:#94a3b8; }
  .error { color:#dc2626; }
  .cursor { display:inline-block; width:2px; height:1em; margin-left:2px; vertical-align:-2px; background:#7c3aed; animation:blink .8s infinite; }
  .foot { display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-top:1px solid #e5e7eb; color:#94a3b8; font-size:11px; }
  .link { border:0; padding:0; cursor:pointer; color:#6366f1; background:transparent; font:11px system-ui,sans-serif; }
  @keyframes blink { 50% { opacity:0; } }
  @media (prefers-color-scheme: dark) {
    .card { color:#e5e7eb; background:rgba(17,24,39,.98); border-color:#374151; }
    .head,.foot { border-color:#374151; }
    .source,.icon:hover { background:#1f2937; }
    .source,.result { border-color:#374151; }
    .result { color:#e5e7eb; background:#111827; }
    .thinking { border-color:#4c3d70; background:#211b2f; }
    .thinking-head { color:#c4b5fd; background:#2d2440; }
    .thinking-body { color:#b8afc7; }
    .source,.icon { color:#aeb8c8; }
  }
`;

function clampPosition(x: number, y: number, width: number, height: number) {
  return {
    left: Math.max(12, Math.min(x, window.innerWidth - width - 12)),
    top: Math.max(12, Math.min(y, window.innerHeight - height - 12))
  };
}

function readSelection(): SelectionSnapshot | null {
  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    const start = active.selectionStart ?? 0;
    const end = active.selectionEnd ?? 0;
    const text = active.value.slice(start, end).trim();
    if (!text) return null;
    const rect = active.getBoundingClientRect();
    return { text, x: Math.min(rect.right - 26, window.innerWidth - 38), y: Math.min(rect.bottom + 6, window.innerHeight - 38) };
  }

  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const text = selection.toString().trim();
  if (!text) return null;
  const range = selection.getRangeAt(0);
  const rects = range.getClientRects();
  const rect = rects.length ? rects[rects.length - 1]! : range.getBoundingClientRect();
  return { text, x: rect.right + 7, y: rect.bottom + 7 };
}

function App() {
  const [settings, setSettings] = useState<TranslatorSettings>(DEFAULT_SETTINGS);
  const [selection, setSelection] = useState<SelectionSnapshot | null>(null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ViewStatus>("idle");
  const [result, setResult] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [reasoningOpen, setReasoningOpen] = useState(true);
  const [error, setError] = useState("");
  const [manualPosition, setManualPosition] = useState<Point | null>(null);
  const portRef = useRef<ReturnType<typeof browser.runtime.connect> | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);

  const initialCardPosition = useMemo(
    () => selection ? clampPosition(selection.x, selection.y + 34, 390, 460) : { left: 12, top: 12 },
    [selection]
  );
  const cardPosition = manualPosition ?? initialCardPosition;
  const triggerPosition = useMemo(
    () => selection ? clampPosition(selection.x, selection.y, 20, 20) : { left: 12, top: 12 },
    [selection]
  );

  useEffect(() => {
    getSettings().then(setSettings);
    return watchSettings(setSettings);
  }, []);

  useEffect(() => {
    if (resultRef.current) resultRef.current.scrollTop = resultRef.current.scrollHeight;
  }, [result, error]);

  function cancelCurrent() {
    if (requestIdRef.current && portRef.current) {
      portRef.current.postMessage({ type: "cancel", requestId: requestIdRef.current });
    }
    portRef.current?.disconnect();
    portRef.current = null;
    requestIdRef.current = null;
  }

  function translate(snapshot: SelectionSnapshot) {
    cancelCurrent();
    setSelection(snapshot);
    setManualPosition(null);
    setOpen(true);
    setResult("");
    setReasoning("");
    setReasoningOpen(true);
    setError("");
    setStatus("loading");

    const requestId = crypto.randomUUID();
    requestIdRef.current = requestId;
    const port = browser.runtime.connect({ name: "translation-stream" });
    let settled = false;
    portRef.current = port;
    port.onMessage.addListener((message: ServerMessage) => {
      if (message.requestId !== requestId) return;
      if (message.type === "reasoning") {
        setStatus("streaming");
        setReasoning((current) => current + message.text);
      } else if (message.type === "delta") {
        setStatus("streaming");
        setReasoningOpen(false);
        setResult((current) => current + message.text);
      } else if (message.type === "finish") {
        settled = true;
        setStatus("done");
        setReasoningOpen(false);
        if (requestIdRef.current === requestId) requestIdRef.current = null;
        port.disconnect();
        if (portRef.current === port) portRef.current = null;
      } else if (message.type === "error") {
        settled = true;
        setStatus("error");
        setError(message.message);
        if (requestIdRef.current === requestId) requestIdRef.current = null;
        port.disconnect();
        if (portRef.current === port) portRef.current = null;
      }
    });
    port.onDisconnect.addListener(() => {
      if (!settled && requestIdRef.current === requestId) {
        requestIdRef.current = null;
        if (portRef.current === port) portRef.current = null;
        setStatus("error");
        setError("与翻译后台的连接已断开，请刷新页面后重试");
      }
    });
    port.postMessage({ type: "translate", requestId, text: snapshot.text });
  }

  function startDragging(event: React.PointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function drag(event: React.PointerEvent<HTMLElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const rect = cardRef.current?.getBoundingClientRect();
    const width = rect?.width ?? 390;
    const height = rect?.height ?? 460;
    setManualPosition(clampPosition(
      event.clientX - current.offsetX,
      event.clientY - current.offsetY,
      width,
      height
    ));
  }

  function stopDragging(event: React.PointerEvent<HTMLElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  useEffect(() => {
    const update = (event: Event) => {
      if (event.composedPath().some((node) => node instanceof HTMLElement && node.id === "stream-select-translator-root")) return;
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
      const snapshot = readSelection();
      if (!snapshot || snapshot.text.length < settings.minChars) {
        cancelCurrent();
        setOpen(false);
        setSelection(null);
        return;
      }
      const limited = { ...snapshot, text: snapshot.text.slice(0, settings.maxChars) };
      if (open && limited.text !== selection?.text) {
        cancelCurrent();
        setOpen(false);
        setResult("");
        setReasoning("");
      }
      setSelection(limited);
      if (settings.triggerMode === "auto") {
        autoTimerRef.current = setTimeout(() => translate(limited), 400);
      }
    };

    document.addEventListener("pointerup", update, true);
    document.addEventListener("keyup", update, true);
    return () => {
      document.removeEventListener("pointerup", update, true);
      document.removeEventListener("keyup", update, true);
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    };
  }, [settings.triggerMode, settings.minChars, settings.maxChars, open, selection?.text]);

  useEffect(() => {
    const listener = (message: { type?: string; text?: string }) => {
      if (message.type === "external-translate" && message.text) {
        const snapshot = readSelection() ?? { text: message.text, x: window.innerWidth / 2, y: 80 };
        translate({ ...snapshot, text: message.text.slice(0, settings.maxChars) });
      } else if (message.type === "translate-current-selection") {
        const snapshot = readSelection();
        if (snapshot) translate({ ...snapshot, text: snapshot.text.slice(0, settings.maxChars) });
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [settings.maxChars]);

  useEffect(() => () => {
    cancelCurrent();
    portRef.current?.disconnect();
  }, []);

  if (!selection) return null;

  return <>
    {!open && settings.triggerMode === "click" && (
      <button className="trigger" style={triggerPosition} title="翻译选中文本" aria-label="翻译选中文本" onClick={() => translate(selection)} />
    )}
    {open && (
      <section ref={cardRef} className="card" style={cardPosition} aria-label="翻译结果">
        <header
          className="head"
          onPointerDown={startDragging}
          onPointerMove={drag}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
        >
          <div className="brand"><span className="dot" />翻译为{settings.targetLanguage}</div>
          <div className="actions">
            <button className="icon" onClick={() => navigator.clipboard.writeText(result)} disabled={!result}>复制</button>
            <button className="icon" onClick={() => translate(selection)}>重试</button>
            <button className="icon" onClick={() => { cancelCurrent(); setOpen(false); setSelection(null); }}>关闭</button>
          </div>
        </header>
        <div className="body">
          <div className="field">
            <div className="label">原文</div>
            <div className="source">{selection.text}</div>
          </div>
          <div className="field">
            <div className="label">译文</div>
            <div ref={resultRef} className={`result ${status === "error" ? "error" : ""}`}>
              {settings.enableThinking && (reasoning || status === "loading" || status === "streaming") && (
                <div className="thinking">
                  <button className="thinking-head" onClick={() => setReasoningOpen((value) => !value)}>
                    <span>思考过程</span><span>{reasoningOpen ? "收起" : "展开"}</span>
                  </button>
                  {reasoningOpen && <div className="thinking-body">{reasoning || "等待模型返回思考过程…"}</div>}
                </div>
              )}
              {status === "loading" && <span className="placeholder">正在连接模型…</span>}
              {status === "error" ? error : result}
              {(status === "loading" || status === "streaming") && <span className="cursor" />}
            </div>
          </div>
        </div>
        <footer className="foot">
          <span>{selection.text.length} 字符 · {settings.model}</span>
          <button className="link" onClick={() => browser.runtime.openOptionsPage()}>设置</button>
        </footer>
      </section>
    )}
  </>;
}

export default defineContentScript({
  matches: ["<all_urls>"],
  cssInjectionMode: "ui",
  async main() {
    const host = document.createElement("div");
    host.id = "stream-select-translator-root";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = styles;
    const mount = document.createElement("div");
    shadow.append(style, mount);
    document.documentElement.appendChild(host);
    createRoot(mount).render(<App />);
  }
});
