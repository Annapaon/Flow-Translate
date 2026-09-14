import { PageTranslationPreferences } from "../../shared/PageTranslationPreferences";
import type { TranslatorSettings } from "../../shared/types";
import React, { useEffect, useState } from "react";
import type { PageStatus } from "../../content/page-translation/controller";
function ControlIcon({ kind }: { kind: "translate" | "pause" | "disable" }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "translate" ? <><path d="M3 5h12M9 3v2M6 5c0 5 4 9 8 11M12 5c0 5-4 9-9 12M14 21l4-10 4 10M16 17h4" /></> : kind === "pause" ? <><path d="M8 5v14M16 5v14" /></> : <><circle cx="12" cy="12" r="9" /><path d="m6 6 12 12" /></>}
  </svg>;
}
export function PageControls({ settings, update }: {
  settings: TranslatorSettings;
  update: (patch: Partial<TranslatorSettings>) => void;
}) {
  const en = settings.uiLanguage === "en";
  const [tab, setTab] = useState<number>();
  const [status, setStatus] = useState<PageStatus>();
  const [error, setError] = useState("");
  const [site, setSite] = useState<{
    host?: string;
    paused?: boolean;
    permanent?: boolean;
  }>({});
  const t = (zh: string, english: string) => (en ? english : zh);
  useEffect(() => {
    let alive = true;
    void browser.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => {
        if (alive) setTab(tab?.id);
      });
    void browser.runtime.sendMessage({ type: "site-state" }).then((v) => {
      if (alive) setSite(v ?? {});
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!tab || !settings.pageTranslationEnabled) return;
    const poll = () =>
      browser.tabs
        .sendMessage(tab, { type: "page-status" })
        .then((v) => setStatus(v))
        .catch(() =>
          setError(
            t(
              "此页面暂不支持，请刷新普通网页后重试",
              "Page unavailable. Refresh a regular webpage and retry.",
            ),
          ),
        );
    void poll();
    const timer = setInterval(poll, 700);
    return () => clearInterval(timer);
  }, [tab, en, settings.pageTranslationEnabled]);
  async function command(action: string) {
    if (!tab) return;
    try {
      setError("");
      setStatus(
        await browser.tabs.sendMessage(tab, {
          type: "page-control",
          action,
        }),
      );
    } catch {
      setError(
        t(
          "页面连接失败，请刷新页面",
          "Page connection failed. Refresh the page.",
        ),
      );
    }
  }
  async function pause(mode: string) {
    const next = await browser.runtime.sendMessage({
      type: "site-pause",
      mode,
    });
    setSite(next ?? {});
    if (next?.error) setError(next.error);
  }
  return (
    <section className="page-controls">
      <PageTranslationPreferences settings={settings} update={update}
        translateDisabled={tab === undefined || !settings.privacyConsentAccepted || site.paused || site.permanent || status?.state === "starting" || status?.state === "running"}
        onTranslate={async () => {
          if (tab === undefined) throw new Error(t("没有可翻译的页面", "No page available"));
          const result = await browser.tabs.sendMessage(tab, { type: "page-control", action: "start" });
          if (!result || result.state === "idle") throw new Error(t("此页面不可翻译，请确认网站规则并刷新页面。", "This page cannot be translated. Check site rules and refresh."));
          window.close();
        }} />
      {settings.pageTranslationEnabled && <div className="page-actions">
        {status?.state === "running" && (
          <button onClick={() => command("pause")}>{t("暂停", "Pause")}</button>
        )}
        {status?.state === "paused" && (
          <button onClick={() => command("resume")}>
            {t("继续", "Resume")}
          </button>
        )}
        {status && status.state !== "idle" && (
          <button onClick={() => command("restore")}>
            {t("恢复原文", "Restore originals")}
          </button>
        )}
        {!!status?.failed && (
          <button onClick={() => command("retry")}>
            {t("重试失败段落", "Retry failed blocks")}
          </button>
        )}
      </div>}
      {settings.pageTranslationEnabled && status && status.state !== "idle" && (
        <p role="status">
          {t("完成", "Done")} {status.done} / {status.total} ·{" "}
          {t("失败", "Failed")} {status.failed} · {t("跳过", "Skipped")}{" "}
          {status.skipped}
          {!!status.degraded &&
            ` · ${t("格式降级", "Plain fallback")} ${status.degraded}`}
          <br />
          {status.error}
        </p>
      )}
      {site.host && (
        <div className="site-controls">
          <small>{site.host}</small>
          <div className="page-actions site-actions">
            <button onClick={() => pause(site.paused ? "resume" : "session")}>
              <ControlIcon kind="pause" />{site.paused
                ? t("恢复网站翻译", "Resume site")
                : t("本次会话暂停", "Pause site this session")}
            </button>
            <button
              onClick={() =>
                pause(site.permanent ? "restore-permanent" : "permanent")
              }
            >
              <ControlIcon kind="disable" />{site.permanent
                ? t("解除永久禁用", "Enable site")
                : t("永久禁用", "Disable site")}
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
