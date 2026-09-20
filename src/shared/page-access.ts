import { blockedUrl } from "./site-access";
import type { PublicTranslatorSettings } from "./types";
export type PageAccessReason = "settings-loading" | "disabled" | "consent" | "paused" | "blocked" | "unsupported" | "frame" | "document-loading";
export function pageAccessReason(settings: PublicTranslatorSettings | undefined, url: string, topLevel: boolean, hasBody: boolean): PageAccessReason | undefined {
  if (!/^https?:\/\//.test(url)) return "unsupported";
  if (!topLevel) return "frame";
  if (!hasBody) return "document-loading";
  if (!settings) return "settings-loading";
  if (!settings.pageTranslationEnabled) return "disabled";
  if (!settings.privacyConsentAccepted) return "consent";
  if (settings.paused) return "paused";
  if (blockedUrl(url, settings)) return "blocked";
}
export function pageAccessMessage(reason: PageAccessReason, en: boolean): string {
  const messages: Record<PageAccessReason, [string, string]> = {
    "settings-loading": ["页面配置尚未就绪，请稍后重试。", "Page settings are loading. Please retry shortly."],
    disabled: ["请先开启网页全文翻译。", "Enable page translation first."],
    consent: ["请先点击了解并同意数据处理说明。", "Accept the data handling notice first."],
    paused: ["此网站已暂停或禁用，请先恢复网站翻译。", "This site is paused or disabled. Enable it first."],
    blocked: ["此网站不在允许范围内，请检查设置中的网站规则。", "This site is excluded. Check website access settings."],
    unsupported: ["此页面不支持翻译，请打开普通 HTTP 或 HTTPS 网页。", "Open a regular HTTP or HTTPS webpage to translate."],
    frame: ["请在网页主页面选择区域，嵌入框架暂不支持。", "Select a region in the main page; embedded frames are unsupported."],
    "document-loading": ["网页正文尚未加载，请等待页面加载后重试。", "The page body is still loading. Retry after it loads."]
  };
  return messages[reason][en ? 1 : 0];
}
