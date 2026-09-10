import React from "react";
import type { TranslatorSettings } from "./types";
import { LANGUAGE_NAMES } from "../core/translation/language";
import { isMachine } from "../core/services/capabilities";
export function TranslationPreferences({
  settings: s,
  update,
}: {
  settings: TranslatorSettings;
  update: (patch: Partial<TranslatorSettings>) => void;
}) {
  const en = s.uiLanguage === "en",
    t = (zh: string, enText: string) => (en ? enText : zh);
  const machine = isMachine(
    s.modelProfiles.find((p) => p.id === s.activeModelId)?.provider ??
      s.provider,
  );
  return (
    <div className="translation-preferences">
      <label>
        <input
          type="checkbox"
          checked={s.bidirectional}
          onChange={(e) => update({ bidirectional: e.target.checked })}
        />
        {t("双向互译", "Bidirectional translation")}
      </label>
      {s.bidirectional && (
        <label>
          {t("互译语言（中文 ↔）", "Pair language (Chinese ↔)")}
          <select
            aria-label={t("互译语言", "Pair language")}
            value={s.pairLanguage}
            onChange={(e) => update({ pairLanguage: e.target.value })}
          >
            {LANGUAGE_NAMES.filter(
              (x) => !["简体中文", "繁體中文"].includes(x),
            ).map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <small>
            {t(
              "其他语言默认译为中文；原翻译方向已保留，关闭后恢复。",
              "Other languages translate to Chinese. Your original direction is restored when disabled.",
            )}
          </small>
        </label>
      )}
      <label>
        <input
          type="checkbox"
          disabled={machine}
          checked={s.smartOutput}
          onChange={(e) => update({ smartOutput: e.target.checked })}
        />
        {t(
          "智能输出：单词释义、短语解释、句子翻译",
          "Smart output: word meanings, phrase explanations, sentence translation",
        )}
      </label>
      {machine && (
        <p>
          {t(
            "此服务仅支持纯翻译。提示词、思考过程、解释和术语控制仅用于大模型，配置会保留。",
            "This service translates text only. Prompts, reasoning, explanations and terminology are retained for LLM services.",
          )}
        </p>
      )}
      <details>
        <summary>
          {t("自定义术语", "Custom terms")} ({s.terms.length}/100)
        </summary>
        {s.terms.map((term, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              marginBlock: 8,
            }}
          >
            <input
              aria-label={t("源词", "Source term")}
              value={term.source}
              maxLength={200}
              placeholder={t("源词", "Source term")}
              onChange={(e) =>
                update({
                  terms: s.terms.map((x, j) =>
                    j === i ? { ...x, source: e.target.value } : x,
                  ),
                })
              }
            />
            <input
              aria-label={t("译词", "Target term")}
              value={term.target}
              disabled={term.preserve}
              maxLength={300}
              placeholder={t("译词", "Target term")}
              onChange={(e) =>
                update({
                  terms: s.terms.map((x, j) =>
                    j === i ? { ...x, target: e.target.value } : x,
                  ),
                })
              }
            />
            <select
              aria-label={t("术语源语言", "Term source language")}
              value={term.sourceLanguage}
              onChange={(e) =>
                update({
                  terms: s.terms.map((x, j) =>
                    j === i ? { ...x, sourceLanguage: e.target.value } : x,
                  ),
                })
              }
            >
              {["auto", ...LANGUAGE_NAMES].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <select
              aria-label={t("术语目标语言", "Term target language")}
              value={term.targetLanguage}
              onChange={(e) =>
                update({
                  terms: s.terms.map((x, j) =>
                    j === i ? { ...x, targetLanguage: e.target.value } : x,
                  ),
                })
              }
            >
              {LANGUAGE_NAMES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <label>
              <input
                type="checkbox"
                checked={term.preserve}
                onChange={(e) =>
                  update({
                    terms: s.terms.map((x, j) =>
                      j === i ? { ...x, preserve: e.target.checked } : x,
                    ),
                  })
                }
              />
              {t("保留原文", "Keep original")}
            </label>
            <button
              type="button"
              onClick={() =>
                update({ terms: s.terms.filter((_, j) => j !== i) })
              }
            >
              {t("删除", "Delete")}
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={s.terms.length >= 100}
          onClick={() =>
            update({
              terms: [
                ...s.terms,
                {
                  source: "",
                  target: "",
                  sourceLanguage: "auto",
                  targetLanguage: s.targetLanguage,
                  preserve: false,
                },
              ],
            })
          }
        >
          {t("添加术语", "Add term")}
        </button>
        <small>
          {t(
            "仅大模型使用命中的术语；语言方向独立，不自动反转。",
            "Only matching terms are sent to LLMs. Terms apply in the specified direction.",
          )}
        </small>
      </details>
    </div>
  );
}
