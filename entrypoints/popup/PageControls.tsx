import React, { useEffect, useState } from "react";
import type { PageStatus } from "../../content/page-translation/controller";
import { LANGUAGE_NAMES } from "../../core/translation/language";
export function PageControls({
  en,
  serviceName,
  direction,
}: {
  en: boolean;
  serviceName: string;
  direction: string;
}) {
  const [estimate, setEstimate] = useState<number>();
  const [tab, setTab] = useState<number>();
  const [status, setStatus] = useState<PageStatus>();
  const [error, setError] = useState("");
  const [target, setTarget] = useState("");
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
    if (!tab) return;
    void browser.tabs
      .sendMessage(tab, { type: "page-preview" })
      .then((v) => setEstimate(v?.characters))
      .catch(() => {});
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
  }, [tab, en]);
  async function command(action: string) {
    if (!tab) return;
    try {
      setError("");
      setStatus(
        await browser.tabs.sendMessage(tab, {
          type: "page-control",
          action,
          target: target || undefined,
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
    <section
      style={{
        borderTop: "1px solid #94a3b855",
        paddingTop: 10,
        marginTop: 12,
      }}
    >
      <strong>{t("网页全文翻译", "Translate this page")}</strong>
      <p>
        {serviceName} · {target || direction}
        {estimate !== undefined && ` · ${estimate} ${t("字符", "chars")}`}
      </p>
      <label>
        {t("本页目标语言", "Page target language")}
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">
            {t("按当前翻译规则", "Use current translation rules")}
          </option>
          {LANGUAGE_NAMES.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <small>
        {t(
          "将可读正文发送到当前服务，译文显示在原文下方。",
          "Sends readable page text to the current service and displays translations below the originals.",
        )}
      </small>
      <div
        style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBlock: 8 }}
      >
        <button
          disabled={!tab || site.paused || site.permanent}
          onClick={() => command("start")}
        >
          {t("翻译此页", "Translate page")}
        </button>
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
      </div>
      {status && status.state !== "idle" && (
        <p role="status">
          {status.service} · {status.target}
          <br />
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
        <div>
          <small>{site.host}</small>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => pause(site.paused ? "resume" : "session")}>
              {site.paused
                ? t("恢复网站翻译", "Resume site")
                : t("本次会话暂停", "Pause site this session")}
            </button>
            <button
              onClick={() =>
                pause(site.permanent ? "restore-permanent" : "permanent")
              }
            >
              {site.permanent
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
