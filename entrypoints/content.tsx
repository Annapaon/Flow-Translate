import { installPageTranslation } from "../content/page-translation/controller";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { PublicTranslatorSettings, ServerMessage } from "../shared/types";
import { DEFAULT_PUBLIC_SETTINGS } from "../shared/types";
import { ROUTE_CHANGE_EVENT } from "../shared/constants";

interface SelectionSnapshot {
  text: string;
  x: number;
  y: number;
  isCurrent?: () => boolean;
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
  .card { position: fixed; z-index: 2147483647; width: min(390px, calc(100vw - 24px)); max-height: calc(100vh - 24px); overflow: hidden; border: 1px solid rgba(148,163,184,.35); border-radius: 14px; color: #172033; background: rgba(255,255,255,.98); box-shadow: 0 18px 55px rgba(15,23,42,.28); font: 14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
  .head { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid #e5e7eb; cursor:move; user-select:none; touch-action:none; }
  .brand { display:flex; align-items:center; gap:8px; font-weight:700; }
  .dot { width:9px; height:9px; border-radius:50%; background:#7c3aed; box-shadow:0 0 0 4px #ede9fe; }
  .actions { display:flex; gap:4px; }
  .icon { border:0; border-radius:7px; padding:5px 8px; cursor:pointer; color:#475569; background:transparent; font:13px system-ui,sans-serif; }
  .icon:hover { background:#f1f5f9; }
  .body { max-height:calc(100vh - 106px); overflow:auto; padding:13px 14px 15px; }
  .field { margin-bottom:11px; }
  .field:last-child { margin-bottom:0; }
  .label { margin:0 0 5px 2px; color:#64748b; font-size:11px; font-weight:700; letter-spacing:.06em; }
  .result-label { display:flex; align-items:center; justify-content:space-between; }
  .edit-result { border:0; padding:1px 5px; cursor:pointer; color:#6555df; background:transparent; font:11px system-ui,sans-serif; letter-spacing:0; }
  .source,.result { padding:10px 11px; overflow:auto; border:1px solid #e2e8f0; border-radius:9px; white-space:pre-wrap; word-break:break-word; user-select:text; }
  .box-wrap { position:relative; }
  .box-wrap .source,.box-wrap .result { padding-bottom:36px; }
  .copy-text { position:absolute; right:7px; bottom:7px; display:grid; place-items:center; width:25px; height:23px; border:1px solid #dbe2ec; border-radius:6px; cursor:pointer; color:#64748b; background:rgba(255,255,255,.94); font:15px/1 system-ui,sans-serif; box-shadow:0 1px 4px rgba(15,23,42,.08); }
  .copy-text:hover { color:#6d28d9; border-color:#c4b5fd; background:#f5f3ff; }
  .source { max-height:72px; color:#64748b; background:#f8fafc; font-size:12px; }
  .result { min-height:120px; max-height:260px; color:#172033; background:#fff; }
  .result-edit { display:block; width:100%; min-height:160px; max-height:260px; resize:vertical; padding:10px 11px 36px; overflow:auto; border:1px solid #8b5cf6; border-radius:9px; color:#172033; background:#fff; outline:none; font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; box-shadow:0 0 0 3px #8b5cf619; }
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
    .result-edit { color:#e5e7eb; background:#111827; }
    .thinking { border-color:#4c3d70; background:#211b2f; }
    .thinking-head { color:#c4b5fd; background:#2d2440; }
    .thinking-body { color:#b8afc7; }
    .copy-text { color:#aeb8c8; border-color:#475569; background:#1f2937; }
    .source,.icon { color:#aeb8c8; }
  }
`;

function clampPosition(x: number, y: number, width: number, height: number) {
  return {
    left: Math.max(12, Math.min(x, window.innerWidth - width - 12)),
    top: Math.max(12, Math.min(y, window.innerHeight - height - 12))
  };
}

function textControlCaretPoint(control: HTMLInputElement | HTMLTextAreaElement, end: number) {
  const computed = getComputedStyle(control);
  const mirror = document.createElement("div");
  Object.assign(mirror.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    visibility: "hidden",
    boxSizing: computed.boxSizing,
    width: `${control.clientWidth}px`,
    padding: computed.padding,
    border: computed.border,
    font: computed.font,
    letterSpacing: computed.letterSpacing,
    lineHeight: computed.lineHeight,
    whiteSpace: control instanceof HTMLTextAreaElement ? "pre-wrap" : "pre",
    overflowWrap: "break-word"
  });
  mirror.textContent = control.value.slice(0, end);
  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const lineHeight = Number.parseFloat(computed.lineHeight) || Number.parseFloat(computed.fontSize) * 1.3;
  const point = { x: marker.offsetLeft - control.scrollLeft, y: marker.offsetTop - control.scrollTop + lineHeight };
  mirror.remove();
  return point;
}

function readSelection(): SelectionSnapshot | null {
  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    // Input types without text selection support (email, number, date, …)
    // throw InvalidStateError when the selection offsets are read.
    let start: number | null;
    let end: number | null;
    try {
      start = active.selectionStart;
      end = active.selectionEnd;
    } catch {
      return null;
    }
    if (start === null || end === null) return null;
    const text = active.value.slice(start, end).trim();
    if (!text) return null;
    const rect = active.getBoundingClientRect();
    const caret = textControlCaretPoint(active, end);
    return { text, x: rect.left + caret.x + window.scrollX + 5, y: rect.top + caret.y + window.scrollY + 5,
      isCurrent: () => document.activeElement === active && active.selectionStart === start && active.selectionEnd === end && active.value.slice(start!, end!).trim() === text };
  }

  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const text = selection.toString().trim();
  if (!text) return null;
  const range = selection.getRangeAt(0);
  const rects = range.getClientRects();
  const rect = rects.length ? rects[rects.length - 1]! : range.getBoundingClientRect();
  const { startContainer, startOffset, endContainer, endOffset } = range;
  return { text, x: rect.right + window.scrollX + 7, y: rect.bottom + window.scrollY + 7,
    isCurrent: () => {
      const current = document.getSelection();
      if (!current || current.isCollapsed || !current.rangeCount) return false;
      const next = current.getRangeAt(0);
      return next.startContainer === startContainer && next.startOffset === startOffset &&
        next.endContainer === endContainer && next.endOffset === endOffset && current.toString().trim() === text;
    } };
}

function matchesCurrentSite(sites: string[]): boolean {
  const hostname = location.hostname.toLowerCase();
  return sites.some((value) => {
    const normalized = value.trim().toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^\*\./, "")
      .split("/")[0]
      ?.split(":")[0];
    return Boolean(normalized) && (hostname === normalized || hostname.endsWith(`.${normalized}`));
  });
}

function isCurrentSiteBlocked(settings: PublicTranslatorSettings): boolean {
  return settings.siteAccessMode === "whitelist"
    ? !matchesCurrentSite(settings.allowedSites)
    : matchesCurrentSite(settings.blockedSites);
}

function App() {
  const [actualService, setActualService] = useState("");
  const [showReasoning, setShowReasoning] = useState(false);
  const [actualTarget, setActualTarget] = useState("");
  const [uncertainDirection, setUncertainDirection] = useState(false);
  const [selectedService, setSelectedService] = useState("");
  const [sitePaused, setSitePaused] = useState(false);
  const [settings, setSettings] = useState<PublicTranslatorSettings>(DEFAULT_PUBLIC_SETTINGS);
  const [selection, setSelection] = useState<SelectionSnapshot | null>(null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ViewStatus>("idle");
  const [result, setResult] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [reasoningOpen, setReasoningOpen] = useState(true);
  const [error, setError] = useState("");
  const [wasCached, setWasCached] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [editingResult, setEditingResult] = useState(false);
  const [copiedField, setCopiedField] = useState<"source" | "result" | null>(null);
  const [manualPosition, setManualPosition] = useState<Point | null>(null);
  const [viewportRevision, setViewportRevision] = useState(0);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const portRef = useRef<ReturnType<typeof browser.runtime.connect> | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const interactingWithCardRef = useRef(false);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);

  const initialCardPosition = useMemo(
    () => selection ? clampPosition(selection.x - window.scrollX, selection.y - window.scrollY + 34, 390, 460) : { left: 12, top: 12 },
    [selection, viewportRevision]
  );
  const cardPosition = manualPosition ?? initialCardPosition;
  const triggerPosition = useMemo(
    () => selection ? clampPosition(selection.x - window.scrollX, selection.y - window.scrollY, 20, 20) : { left: 12, top: 12 },
    [selection, viewportRevision]
  );

  useEffect(() => {
    const settingsPort = browser.runtime.connect({ name: "public-settings" });
    settingsPort.onMessage.addListener((value: PublicTranslatorSettings) => { setSettings(value); setSitePaused(Boolean(value.paused)); });
    return () => settingsPort.disconnect();
  }, []);

  useEffect(() => {
    const updateViewport = () => setViewportRevision((value) => value + 1);
    window.addEventListener("scroll", updateViewport, true);
    window.addEventListener("resize", updateViewport);
    return () => {
      window.removeEventListener("scroll", updateViewport, true);
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  function cancelCurrent() {
    if (requestIdRef.current && portRef.current) {
      portRef.current.postMessage({ type: "cancel", requestId: requestIdRef.current });
    }
    portRef.current?.disconnect();
    portRef.current = null;
    requestIdRef.current = null;
  }

  function translate(snapshot: SelectionSnapshot, refresh = false, target?: string) {
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    if (sitePaused) return;
    cancelCurrent();
    setActualTarget("");
    setSelection(snapshot);
    setManualPosition(null);
    setOpen(true);
    setResult("");
    setReasoning("");
    setReasoningOpen(true);
    setError("");
    setWasCached(false);
    setReconnecting(false);
    setEditingResult(false);
    setStatus("loading");

    const requestId = crypto.randomUUID();
    requestIdRef.current = requestId;
    const port = browser.runtime.connect({ name: "translation-stream" });
    let settled = false;
    portRef.current = port;
    port.onMessage.addListener((message: ServerMessage) => {
      if (message.requestId !== requestId || requestIdRef.current !== requestId) return;
      if (message.type === "start") { setActualTarget(message.targetLanguage ?? ""); setUncertainDirection(Boolean(message.uncertain)); setShowReasoning(Boolean(message.enableThinking)); setActualService(message.serviceName ?? ""); }
      if (message.type === "retry") {
        setStatus("loading");
        setReconnecting(true);
        setResult("");
        setReasoning("");
      } else if (message.type === "reasoning") {
        setStatus("streaming");
        setReconnecting(false);
        setReasoning((current) => current + message.text);
      } else if (message.type === "delta") {
        setStatus("streaming");
        setReconnecting(false);
        setReasoningOpen(false);
        setResult((current) => current + message.text);
      } else if (message.type === "finish") {
        settled = true;
        setStatus("done");
        setWasCached(Boolean(message.cached));
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
        setError(settings.uiLanguage === "en" ? "The translation service disconnected. Refresh the page and try again." : "与翻译后台的连接已断开，请刷新页面后重试");
      }
    });
    port.postMessage({
      type: "translate",
      requestId,
      text: snapshot.text, refresh, target, serviceId: selectedService || undefined, langHint: document.getSelection()?.anchorNode?.parentElement?.closest("[lang]")?.getAttribute("lang") ?? document.documentElement.lang,
      pageTitle: document.title,
      pageUrl: location.href
    });
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

  async function copyText(field: "source" | "result", text: string) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    window.setTimeout(() => setCopiedField((current) => current === field ? null : current), 1_200);
  }

  function openOptions() {
    void browser.runtime.sendMessage({ type: "open-options" });
  }

  useEffect(() => {
    let pointerSelecting = false;
    const update = (event: Event) => {
      if (event.composedPath().some((node) => node instanceof HTMLElement && node.id === "flow-translate-root")) return;
      if (interactingWithCardRef.current || document.activeElement?.id === "flow-translate-root") return;
      if (event.type === "pointerup") pointerSelecting = false;
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
      if (pointerSelecting) return;
      if (sitePaused || !settings.privacyConsentAccepted || isCurrentSiteBlocked(settings)) {
        cancelCurrent();
        setOpen(false);
        setSelection(null);
        return;
      }
      const snapshot = readSelection();
      if (!snapshot || snapshot.text.length < settings.minChars) {
        cancelCurrent();
        setOpen(false);
        setSelection(null);
        return;
      }
      const limited = { ...snapshot, text: snapshot.text.slice(0, settings.maxChars) };
      if (limited.text !== selectionRef.current?.text) {
        cancelCurrent();
        setOpen(false);
        setResult("");
        setReasoning("");
      }
      setSelection(limited);
      if (settings.triggerMode === "auto") {
        autoTimerRef.current = setTimeout(() => {
          autoTimerRef.current = null;
          if (limited.isCurrent?.()) translate(limited);
        }, 400);
      }
    };

    const startSelection = (event: PointerEvent) => {
      if (event.composedPath().some((node) => node instanceof HTMLElement && node.id === "flow-translate-root")) return;
      pointerSelecting = true;
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    };
    document.addEventListener("pointerdown", startSelection, true);
    document.addEventListener("selectionchange", update);
    document.addEventListener("pointerup", update, true);
    document.addEventListener("keyup", update, true);
    return () => {
      document.removeEventListener("pointerdown", startSelection, true);
      document.removeEventListener("selectionchange", update);
      document.removeEventListener("pointerup", update, true);
      document.removeEventListener("keyup", update, true);
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    };
  }, [settings, sitePaused]);

  useEffect(() => {
    const handleSelectionChange = () => {
      if (interactingWithCardRef.current || !selection) return;
      queueMicrotask(() => {
        if (interactingWithCardRef.current || readSelection()) return;
        if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
        cancelCurrent();
        setOpen(false);
        setSelection(null);
        setResult("");
        setReasoning("");
      });
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [selection]);

  // SPA route changes (plan §4.1): the MAIN-world watcher broadcasts
  // pushState/replaceState as ROUTE_CHANGE_EVENT, and popstate/hashchange
  // cover back/forward and hash navigation. On any real URL change, close the
  // dot and overlay and cancel an in-flight request so results from the
  // previous "page" never linger after navigation.
  useEffect(() => {
    let lastUrl = location.href;
    const handleRouteChange = () => {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
      cancelCurrent();
      setOpen(false);
      setSelection(null);
      setResult("");
      setReasoning("");
    };
    document.addEventListener(ROUTE_CHANGE_EVENT, handleRouteChange);
    window.addEventListener("popstate", handleRouteChange);
    window.addEventListener("hashchange", handleRouteChange);
    return () => {
      document.removeEventListener(ROUTE_CHANGE_EVENT, handleRouteChange);
      window.removeEventListener("popstate", handleRouteChange);
      window.removeEventListener("hashchange", handleRouteChange);
    };
    // Uses only refs and stable state setters; no reactive deps needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const listener = (message: { type?: string; text?: string }) => {
      if (sitePaused || !settings.privacyConsentAccepted || isCurrentSiteBlocked(settings)) return;
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
  }, [settings, sitePaused]);

  useEffect(() => {
    if (!sitePaused && settings.privacyConsentAccepted && !isCurrentSiteBlocked(settings)) return;
    document.dispatchEvent(new Event("flow-access-disabled"));
    cancelCurrent();
    setOpen(false);
    setSelection(null);
  }, [settings, sitePaused]);

  useEffect(() => () => {
    cancelCurrent();
    portRef.current?.disconnect();
  }, []);

  useEffect(() => {
    const listener = (m: {type?: string}) => {
      if (m.type !== "access-changed") return;
      cancelCurrent(); setOpen(false); setSelection(null);
      // Background rechecks current site policy before every request.
      // The public-settings port supplies the current paused state.
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  const en = settings.uiLanguage === "en";
  const t = (zh: string, english: string) => en ? english : zh;
  if (!selection) return null;

  return <>
    {!open && settings.triggerMode === "click" && (
      <button className="trigger" style={triggerPosition} title={t("翻译选中文本", "Translate selection")} aria-label={t("翻译选中文本", "Translate selection")} onClick={() => translate(selection)} />
    )}
    {open && (
      <section
        ref={cardRef}
        className="card"
        style={cardPosition}
        aria-label={t("翻译结果", "Translation result")}
        onPointerDownCapture={() => { interactingWithCardRef.current = true; }}
        onPointerUpCapture={() => { window.setTimeout(() => { interactingWithCardRef.current = false; }, 0); }}
        onPointerCancel={() => { interactingWithCardRef.current = false; }}
      >
        <header
          className="head"
          onPointerDown={startDragging}
          onPointerMove={drag}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
        >
          <div className="brand"><span className="dot" />{t("翻译为", "Translate to ")}{(actualTarget || settings.targetLanguage)}</div>
          <div className="actions">
            <button className="icon" title={t("打开设置", "Open settings")} aria-label={t("打开设置", "Open settings")} onClick={openOptions}>⚙ {t("设置", "Settings")}</button>
          </div>
        </header>
        <div className="body">
          <div className="field">
            <div className="label">{t("原文", "Source")}</div>
            <div className="box-wrap">
              <div className="source">{selection.text}</div>
              <button className="copy-text" title={t("复制原文", "Copy source")} aria-label={t("复制原文", "Copy source")} onClick={() => copyText("source", selection.text)}>{copiedField === "source" ? "✓" : "⧉"}</button>
            </div>
          </div>
          <div className="field">
            <div className="label result-label"><span>{t("译文", "Translation")}</span>{status === "done" && result && <button className="edit-result" onClick={() => setEditingResult((value) => !value)}>{editingResult ? t("完成", "Done") : t("编辑", "Edit")}</button>}</div>
            <div className="box-wrap">
              {editingResult ? <textarea className="result-edit" value={result} onChange={(event) => setResult(event.target.value)} aria-label={t("编辑译文", "Edit translation")} /> : <div className={`result ${status === "error" ? "error" : ""}`}>
                {showReasoning && (reasoning || status === "loading" || status === "streaming") && (
                  <div className="thinking">
                    <button className="thinking-head" onClick={() => setReasoningOpen((value) => !value)}>
                      <span>{t("思考过程", "Reasoning")}</span><span>{reasoningOpen ? t("收起", "Collapse") : t("展开", "Expand")}</span>
                    </button>
                    {reasoningOpen && <div className="thinking-body">{reasoning || t("等待模型返回思考过程…", "Waiting for reasoning…")}</div>}
                  </div>
                )}
                {status === "loading" && <span className="placeholder">{reconnecting ? t("正在重新连接模型...", "Reconnecting to model…") : t("正在连接模型…", "Connecting to model…")}</span>}
                {status === "error" ? error : result}
                {(status === "loading" || status === "streaming") && <span className="cursor" />}
              </div>}
              <button className="copy-text" title={t("复制译文", "Copy translation")} aria-label={t("复制译文", "Copy translation")} disabled={!result} onClick={() => copyText("result", result)}>{copiedField === "result" ? "✓" : "⧉"}</button>
            </div>
          </div>
        </div>
        <footer className="foot">
          <div><button className="link" disabled={status === "loading" || status === "streaming"} onClick={() => translate(selection, true)}>{t("重新翻译", "Translate again")}</button>
          {settings.services && <select aria-label={t("翻译服务", "Translation service")} value={selectedService} onChange={e => setSelectedService(e.target.value)}><option value="">{t("当前服务", "Current service")}</option>{settings.services.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select>}
          {settings.bidirectional && <button className="link" onClick={() => translate(selection, true, actualTarget === settings.pairLanguage ? "简体中文" : settings.pairLanguage)}>{uncertainDirection ? t("确认/切换方向", "Confirm / switch direction") : t("切换方向", "Switch direction")}</button>}</div>
          <span>{selection.text.length} {t("字符", "chars")} · {actualService || settings.model}{wasCached ? t(" · 已缓存", " · cached") : ""}</span>
        </footer>
      </section>
    )}
  </>;
}

export default defineContentScript({
  matches: ["<all_urls>"],
  cssInjectionMode: "ui",
  async main() {
    installPageTranslation();
    const host = document.createElement("div");
    host.id = "flow-translate-root";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = styles;
    const mount = document.createElement("div");
    shadow.append(style, mount);
    document.documentElement.appendChild(host);
    createRoot(mount).render(<App />);
  }
});
