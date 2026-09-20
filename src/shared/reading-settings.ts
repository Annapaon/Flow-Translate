import { LANGUAGE_NAMES, languageCode } from "../core/translation/language";
import { z } from "zod";
import type { SiteRule, TranslationStyle } from "./types";

export const DEFAULT_TRANSLATION_STYLE: TranslationStyle = {
  scale: 1,
  spacing: 0.5,
  tone: "purple",
  background: true
};
export const translationStyleSchema = z
  .object({
    scale: z.number().min(0.75).max(1.5),
    spacing: z.number().min(0).max(2),
    tone: z.enum(["purple", "blue", "neutral"]),
    background: z.boolean()
  })
  .strict();
export function normalizeHostname(value: string) {
  const input = value.trim().toLowerCase();
  if (!input || /[\s/@?#:*\\]/.test(input))
    throw new Error("请仅填写主机名 / Enter a hostname only");
  const url = new URL(`https://${input}`);
  const host = url.hostname.replace(/\.$/, "");
  if (
    !host ||
    host.length > 253 ||
    !/^[a-z0-9.-]+$/.test(host) ||
    host
      .split(".")
      .some((part) => !part || part.startsWith("-") || part.endsWith("-"))
  )
    throw new Error("无效主机名 / Invalid hostname");
  return host;
}
export const siteRuleSchema = z
  .object({
    id: z.string().min(1).max(100),
    host: z
      .string()
      .max(253)
      .transform((value, ctx) => {
        try {
          return normalizeHostname(value);
        } catch {
          ctx.addIssue({ code: "custom", message: "Invalid hostname" });
          return z.NEVER;
        }
      }),
    subdomains: z.boolean(),
    mode: z.enum(["inherit", "manual", "auto"]),
    language: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("inherit") }).strict(),
      z
        .object({
          kind: z.literal("fixed"),
          source: z.enum(["自动检测", "auto", ...LANGUAGE_NAMES]),
          target: z.enum(LANGUAGE_NAMES)
        })
        .strict(),
      z
        .object({
          kind: z.literal("pair"),
          first: z.enum(LANGUAGE_NAMES),
          second: z.enum(LANGUAGE_NAMES)
        })
        .strict()
        .refine(
          (v) => languageCode(v.first) !== languageCode(v.second),
          "互译语言必须不同 / Choose two different languages"
        )
    ])
  })
  .strict();
export const siteRulesSchema = z
  .array(siteRuleSchema)
  .max(100)
  .refine(
    (rules) =>
      new Set(rules.map((r) => r.host)).size === rules.length &&
      new Set(rules.map((r) => r.id)).size === rules.length,
    "网站规则重复 / Duplicate website rule"
  );
export function websiteRuleFor(
  rules: SiteRule[] | undefined,
  url?: string
): SiteRule | undefined {
  if (!url) return undefined;
  let host: string;
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return undefined;
    host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return undefined;
  }
  return rules
    ?.filter(
      (r) => r.host === host || (r.subdomains && host.endsWith(`.${r.host}`))
    )
    .sort(
      (a, b) =>
        Number(b.host === host) - Number(a.host === host) ||
        b.host.length - a.host.length
    )[0];
}

export function forWebsite<
  T extends { siteRules?: SiteRule[]; pageTranslationMode: "manual" | "auto" }
>(settings: T, url?: string): T {
  const rule = websiteRuleFor(settings.siteRules, url);
  if (!rule) return settings;
  const language = rule.language;
  return {
    ...settings,
    ...(rule.mode === "inherit" ? {} : { pageTranslationMode: rule.mode }),
    ...(language.kind === "fixed"
      ? {
          bidirectional: false,
          sourceLanguage: language.source,
          targetLanguage: language.target
        }
      : language.kind === "pair"
        ? {
            bidirectional: true,
            pairSourceLanguage: language.first,
            pairLanguage: language.second
          }
        : {})
  };
}
