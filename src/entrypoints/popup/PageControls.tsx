import { pageStateLabel } from "../../shared/page-state";
import { FeatureServiceSelect } from "../../shared/FeatureServiceSelect";
import { forWebsite, websiteRuleFor } from "../../shared/reading-settings";
import { PageTranslationPreferences } from "../../shared/PageTranslationPreferences";
import { settingsForFeature } from "../../core/translation/model-routing";
import type { TranslatorSettings } from "../../shared/types";
import React from "react";
import { usePageSession } from "./usePageSession";
function ControlIcon({ kind }: { kind: "translate" | "pause" | "disable" }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "translate" ? <><path d="M3 5h12M9 3v2M6 5c0 5 4 9 8 11M12 5c0 5-4 9-9 12M14 21l4-10 4 10M16 17h4" /></> : kind === "pause" ? <><path d="M8 5v14M16 5v14" /></> : <><circle cx="12" cy="12" r="9" /><path d="m6 6 12 12" /></>}
  </svg>;
}
export function PageControls({ settings, update, saving, onServiceChange }: {
  settings: TranslatorSettings;
  saving: boolean;
  onServiceChange: (id: string) => void;
  update: (patch: Partial<TranslatorSettings>) => void;
}) {
  const en = settings.uiLanguage === "en";
  const { tab, pageUrl, status, site, error, setError, command: sendCommand, pause } = usePageSession(en, settings.pageTranslationEnabled);
  const effective = forWebsite(settingsForFeature(settings, "page"), pageUrl);
  const rule = websiteRuleFor(settings.siteRules, pageUrl);
  const t = (zh: string, english: string) => en ? english : zh;
  async function command(action: string) {
    try { await sendCommand(action); } catch (error) { setError(error instanceof Error ? error.message : t("操作失败，请重试。", "Action failed. Please retry.")); }
  }
  return (
    <section className="page-controls">
      <PageTranslationPreferences showShortcutSettings={false} settings={effective} update={update} modeLocked={Boolean(rule && rule.mode !== "inherit")}
        translateDisabled={saving || tab === undefined || !settings.privacyConsentAccepted || site.paused || site.permanent || status?.state === "starting" || status?.state === "running"}
        onTranslate={async () => {
          await sendCommand("start");
          window.close();
        }} />
      {settings.pageTranslationEnabled && <>
        <FeatureServiceSelect settings={settings} feature="page" label={t("全文翻译服务", "Page translation service")} disabled={saving} onChange={onServiceChange} />
        <p className="ft-help">{settings.separateModels ? t("切换仅修改全文和指定区域翻译的服务。", "Switching changes only page and region translation services.") : t("所有翻译功能共用此默认服务。", "All translation features share this default service.")}{status && !["idle", "skipped-target"].includes(status.state) && t("当前任务保留原服务；恢复原文后重新翻译将使用新服务。", "The current task keeps its original service. Restore originals and start again to use the new service.")}</p>
      </>}
      {settings.pageTranslationEnabled && <div className="page-actions">
        <button disabled={saving || !tab || !settings.privacyConsentAccepted || site.paused || site.permanent || (status && !["idle", "skipped-target"].includes(status.state))} onClick={async () => {
          try { await sendCommand("region"); window.close(); }
          catch (error) { setError(error instanceof Error ? error.message : t("选择区域失败，请重试。", "Region selection failed. Please retry.")); }
        }}>{t("翻译指定区域", "Translate a region")}</button>
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
          <strong>{pageStateLabel(status.state, en)}</strong><br />
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
