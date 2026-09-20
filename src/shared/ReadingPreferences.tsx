import React, { useEffect, useState } from "react";
import { LanguageDirection, Toggle } from "./LanguageDirection";
import { DEFAULT_TRANSLATION_STYLE, siteRulesSchema } from "./reading-settings";
import type { SiteRule, TranslatorSettings } from "./types";

export function ReadingPreferences({
  settings: s,
  update
}: {
  settings: TranslatorSettings;
  update: (patch: Partial<TranslatorSettings>) => void;
}) {
  const t = (zh: string, en: string) => (s.uiLanguage === "en" ? en : zh);
  const style = s.translationStyle;
  const [draft, setDraft] = useState<SiteRule | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(""), 4_000);
    return () => clearTimeout(timer);
  }, [error]);
  const ruleSettings = draft
    ? {
        ...s,
        bidirectional: draft.language.kind === "pair",
        ...(draft.language.kind === "fixed"
          ? {
              sourceLanguage: draft.language.source,
              targetLanguage: draft.language.target
            }
          : draft.language.kind === "pair"
            ? {
                pairSourceLanguage: draft.language.first,
                pairLanguage: draft.language.second
              }
            : {})
      }
    : s;
  return (
    <div className="reading-preferences">
      <details className="model-advanced">
        <summary>{t("译文样式", "Translation appearance")}</summary>
        <Toggle
          label={t("显示底色", "Show background")}
          checked={style.background}
          onChange={(background) =>
            update({ translationStyle: { ...style, background } })
          }
        />
        <div className="grid">
          <label>
            {t("相对字号", "Relative font size")}
            <select
              value={style.scale}
              onChange={(e) =>
                update({
                  translationStyle: { ...style, scale: Number(e.target.value) }
                })
              }
            >
              {[0.75, 0.9, 1, 1.1, 1.25, 1.5].map((v) => (
                <option key={v} value={v}>
                  {Math.round(v * 100)}%
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("上下间距", "Vertical spacing")}
            <select
              value={style.spacing}
              onChange={(e) =>
                update({
                  translationStyle: {
                    ...style,
                    spacing: Number(e.target.value)
                  }
                })
              }
            >
              {[0, 0.25, 0.5, 1, 1.5, 2].map((v) => (
                <option key={v} value={v}>
                  {v} em
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("预设底色", "Background tone")}
            <select
              value={style.tone}
              onChange={(e) =>
                update({
                  translationStyle: {
                    ...style,
                    tone: e.target.value as typeof style.tone
                  }
                })
              }
            >
              <option value="purple">{t("淡紫", "Purple")}</option>
              <option value="blue">{t("淡蓝", "Blue")}</option>
              <option value="neutral">{t("中性灰", "Neutral")}</option>
            </select>
          </label>
        </div>
        <div
          className={`reading-preview ${style.tone}`}
          style={{
            fontSize: `${style.scale}em`,
            marginBlock: `${style.spacing}em`,
            background: style.background ? undefined : "transparent",
            borderColor: style.background ? undefined : "transparent"
          }}
        >
          {t(
            "这是译文样式预览，不会调用翻译服务。",
            "Translation preview — no service request is sent."
          )}
        </div>
        <button
          type="button"
          onClick={() =>
            update({ translationStyle: { ...DEFAULT_TRANSLATION_STYLE } })
          }
        >
          {t("恢复默认样式", "Reset appearance")}
        </button>
      </details>
      <details className="model-advanced">
        <summary>{t("网站专属规则", "Website rules")}</summary>
        <p className="ft-help">
          {t(
            "覆盖指定网站的语言和全文模式，仍受总开关、暂停及禁用规则约束。",
            "Override language and page mode per website. Enablement, pause and access rules still apply."
          )}
        </p>
        {s.siteRules.map((rule) => (
          <div className="website-rule" key={rule.id}>
            <span>
              {rule.host}
              {rule.subdomains
                ? t("（含子域名）", " (including subdomains)")
                : ""}
            </span>
            <button
              type="button"
              onClick={() => {
                setDraft(rule);
                setError("");
              }}
            >
              {t("编辑", "Edit")}
            </button>
            <button
              type="button"
              onClick={() => {
                update({
                  siteRules: s.siteRules.filter((r) => r.id !== rule.id)
                });
                if (draft?.id === rule.id) setDraft(null);
              }}
            >
              {t("删除", "Delete")}
            </button>
          </div>
        ))}
        {!draft && (
          <button
            type="button"
            disabled={s.siteRules.length >= 100}
            onClick={() => {
              setError("");
              setDraft({
                id: crypto.randomUUID(),
                host: "",
                subdomains: false,
                mode: "inherit",
                language: { kind: "inherit" }
              });
            }}
          >
            {t("添加网站规则", "Add website rule")}
          </button>
        )}
        {draft && (
          <div className="website-rule-editor">
            <label>
              {t("主机名", "Hostname")}
              <input
                value={draft.host}
                placeholder="example.com"
                onChange={(e) => {
                  setError("");
                  setDraft({ ...draft, host: e.target.value });
                }}
              />
            </label>
            <Toggle
              label={t("包含子域名", "Include subdomains")}
              checked={draft.subdomains}
              onChange={(subdomains) => setDraft({ ...draft, subdomains })}
            />
            <label>
              {t("网站全文模式", "Website page mode")}
              <select
                value={draft.mode}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    mode: e.target.value as SiteRule["mode"]
                  })
                }
              >
                <option value="inherit">
                  {t("跟随全局", "Follow global")}
                </option>
                <option value="manual">
                  {t("按键翻译", "Key translation")}
                </option>
                <option value="auto">
                  {t("自动翻译", "Automatic translation")}
                </option>
              </select>
            </label>
            <Toggle
              label={t("自定义网站语言", "Custom website language")}
              checked={draft.language.kind !== "inherit"}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  language: value
                    ? {
                        kind: "fixed",
                        source: s.sourceLanguage,
                        target: s.targetLanguage
                      }
                    : { kind: "inherit" }
                })
              }
            />
            {draft.language.kind !== "inherit" && (
              <LanguageDirection
                settings={ruleSettings}
                update={(patch) => {
                  const next = { ...ruleSettings, ...patch };
                  setDraft({
                    ...draft,
                    language: next.bidirectional
                      ? {
                          kind: "pair",
                          first: next.pairSourceLanguage,
                          second: next.pairLanguage
                        }
                      : {
                          kind: "fixed",
                          source: next.sourceLanguage,
                          target: next.targetLanguage
                        }
                  });
                }}
              />
            )}
            {error && <p role="alert">{error}</p>}
            <div className="ft-mode-buttons">
              <button
                type="button"
                onClick={() => {
                  try {
                    const siteRules = siteRulesSchema.parse([
                      ...s.siteRules.filter((r) => r.id !== draft.id),
                      draft
                    ]);
                    update({ siteRules });
                    setDraft(null);
                    setError("");
                  } catch {
                    setError(
                      t(
                        "请检查主机名、重复规则和互译语言。",
                        "Check the hostname, duplicate rules and language pair."
                      )
                    );
                  }
                }}
              >
                {t("保存网站规则", "Save website rule")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setError("");
                }}
              >
                {t("取消", "Cancel")}
              </button>
            </div>
          </div>
        )}
      </details>
    </div>
  );
}
