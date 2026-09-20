import { useCallback, useEffect, useRef, useState } from "react";
import type { PageStatus } from "../../content/page-translation/controller";
import { pageAccessMessage } from "../../shared/page-access";

export function statusPollDelay(state?: string, failed = false): number {
  return failed ? 10000 : ["running", "starting", "selecting"].includes(state ?? "") ? 700 : 5000;
}
export function usePageSession(en: boolean, enabled: boolean) {
  const [tab, setTab] = useState<number>();
  const [pageUrl, setPageUrl] = useState("");
  const [status, setStatus] = useState<PageStatus>();
  const [error, setError] = useState("");
  const [site, setSite] = useState<{ host?: string; paused?: boolean; permanent?: boolean }>({});
  const lastFailure = useRef("");
  const t = (zh: string, english: string) => en ? english : zh;
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(""), 4000);
    return () => clearTimeout(timer);
  }, [error]);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const [active] = await browser.tabs.query({ active: true, currentWindow: true });
        const nextSite = await browser.runtime.sendMessage({ type: "site-state" });
        if (alive) { setTab(active?.id); setPageUrl(active?.url ?? ""); setSite(nextSite ?? {}); }
      } catch { /* Closed tabs are handled by the next user action. */ }
    };
    void refresh();
    browser.tabs.onActivated.addListener(refresh);
    // Only URL and load-state changes can affect what the popup shows; title,
    // favicon and progress events fire constantly on busy windows.
    const onUpdated = (_tabId: number, changeInfo: { url?: string; status?: string }) => {
      if (changeInfo.url || changeInfo.status) void refresh();
    };
    browser.tabs.onUpdated.addListener(onUpdated);
    return () => { alive = false; browser.tabs.onActivated.removeListener(refresh); browser.tabs.onUpdated.removeListener(onUpdated); };
  }, []);
  useEffect(() => {
    setStatus(undefined); setError(""); lastFailure.current = "";
    if (tab === undefined || !enabled) return;
    let alive = true;
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      if (busy || !alive) return;
      busy = true;
      let delay = 10000;
      try {
        if (!/^https?:\/\//.test(pageUrl)) throw new Error(pageAccessMessage("unsupported", en));
        const next = await browser.tabs.sendMessage(tab!, { type: "page-status" });
        if (!next || typeof next.state !== "string") throw new Error();
        if (alive) { setStatus(next); setError(""); lastFailure.current = ""; }
        delay = statusPollDelay(next.state);
      } catch {
        const message = /^https?:\/\//.test(pageUrl)
          ? (en ? "Page connection is not ready. Refresh the webpage after installing or updating the extension." : "页面连接尚未就绪；安装或更新插件后，请刷新网页。")
          : pageAccessMessage("unsupported", en);
        if (alive && lastFailure.current !== message) { lastFailure.current = message; setError(message); }
        // Retry modestly while disconnected: the content script may connect at
        // any moment (late load, SPA route change) and the popup should notice
        // well before the 10s idle cadence.
        delay = 2500;
      } finally {
        busy = false;
        if (alive && !document.hidden) timer = setTimeout(() => { void poll(); }, delay);
      }
    }
    const focus = () => { clearTimeout(timer); if (!document.hidden) void poll(); };
    void poll();
    document.addEventListener("visibilitychange", focus);
    window.addEventListener("focus", focus);
    return () => { alive = false; clearTimeout(timer); document.removeEventListener("visibilitychange", focus); window.removeEventListener("focus", focus); };
  }, [tab, pageUrl, enabled, en]);
  const command = useCallback(async (action: string): Promise<PageStatus> => {
    setError("");
    if (tab === undefined) throw new Error(en ? "No page available" : "没有可翻译的页面");
    if (!/^https?:\/\//.test(pageUrl)) throw new Error(pageAccessMessage("unsupported", en));
    let next: PageStatus;
    try { next = await browser.tabs.sendMessage(tab, { type: "page-control", action }); }
    catch { throw new Error(en ? "Page connection failed. Refresh the webpage." : "页面连接失败，请刷新网页后重试。"); }
    if (!next || typeof next.state !== "string") throw new Error(en ? "Refresh the webpage to load the updated extension." : "请刷新网页以加载更新后的插件。");
    setStatus(next);
    if (next.unavailableReason && ["start", "region", "retry", "resume"].includes(action)) throw new Error(pageAccessMessage(next.unavailableReason, en));
    if (action === "region" && next.state !== "selecting") throw new Error(next.error || (en ? "Restore originals before selecting a region." : "请先恢复原文，再选择翻译区域。"));
    if (action === "start" && next.state === "idle") throw new Error(next.error || (en ? "No readable page text." : "页面没有可翻译的正文。"));
    return next;
  }, [tab, pageUrl, en]);
  async function pause(mode: string) {
    setError("");
    try {
      const next = await browser.runtime.sendMessage({ type: "site-pause", mode });
      if (next?.error) throw new Error(next.error);
      setSite(next ?? {});
    } catch { setError(t("网站状态保存失败，请重试。", "Unable to save site state. Please retry.")); }
  }
  return { tab, pageUrl, status, site, error, setError, command, pause };
}
