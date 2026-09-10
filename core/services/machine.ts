import { networkAttempt } from "../translation/meter";
import SparkMD5 from "spark-md5";
import { parseFragment } from "parse5";
import { languageCode } from "../translation/language";
import { validateApiUrl } from "../../shared/security";
import type { TranslatorSettings, ProviderType } from "../../shared/types";
export { isMachine, supportsHtml } from "./capabilities";
export class ServiceError extends Error {
  constructor(
    message: string,
    public retryable = false,
    public fatal = false,
    public retryAfter = 0,
  ) {
    super(message);
  }
}
export function plainFromHtml(html: string): string {
  const visit = (n: any): string =>
    n.nodeName === "#text"
      ? n.value
      : ["script", "style", "iframe"].includes(n.tagName)
        ? ""
        : (n.childNodes ?? []).map(visit).join("");
  return visit(parseFragment(html));
}
function code(provider: ProviderType, language: string) {
  const c = languageCode(language);
  const maps: Record<string, Record<string, string>> = {
    baidu: {
      "zh-CN": "zh",
      "zh-TW": "cht",
      ja: "jp",
      ko: "kor",
      fr: "fra",
      es: "spa",
    },
    microsoft: { "zh-CN": "zh-Hans", "zh-TW": "zh-Hant" },
    deepl: { "zh-CN": "ZH-HANS", "zh-TW": "ZH-HANT" },
  };
  return maps[provider]?.[c] ?? (provider === "deepl" ? c.toUpperCase() : c);
}
export async function machineTranslate(
  texts: string[],
  settings: TranslatorSettings,
  signal: AbortSignal,
  html = false,
): Promise<string[]> {
  const profile = settings.modelProfiles.find(
    (p) => p.id === settings.activeModelId,
  )!;
  const provider = settings.provider;
  if (!profile || !profile.apiKey)
    throw new ServiceError(
      "请配置翻译服务密钥 / Configure the service key",
      false,
      true,
    );
  const source = code(provider, settings.sourceLanguage),
    target = code(provider, settings.targetLanguage);
  const auto = source.toLowerCase() === "auto";
  const url = new URL(validateApiUrl(profile.apiBaseUrl));
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  let body: string;
  if (provider === "baidu") {
    if (!profile.appId)
      throw new ServiceError(
        "请配置百度 App ID / Configure Baidu App ID",
        false,
        true,
      );
    if (texts.length !== 1)
      throw new ServiceError("Baidu accepts one block per request");
    const q = texts[0]!,
      salt = crypto.randomUUID();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams({
      q,
      from: source,
      to: target,
      appid: profile.appId,
      salt,
      sign: SparkMD5.hash(profile.appId + q + salt + profile.apiKey),
    }).toString();
  } else if (provider === "microsoft") {
    url.searchParams.set("api-version", "3.0");
    url.searchParams.set("to", target);
    if (!auto) url.searchParams.set("from", source);
    url.searchParams.set("textType", html ? "html" : "plain");
    headers["Ocp-Apim-Subscription-Key"] = profile.apiKey;
    if (profile.region)
      headers["Ocp-Apim-Subscription-Region"] = profile.region;
    body = JSON.stringify(texts.map((Text) => ({ Text })));
  } else if (provider === "google") {
    headers["X-Goog-Api-Key"] = profile.apiKey;
    body = JSON.stringify({
      q: texts,
      target,
      ...(!auto ? { source } : {}),
      format: html ? "html" : "text",
    });
  } else if (provider === "deepl") {
    headers.Authorization = `DeepL-Auth-Key ${profile.apiKey}`;
    body = JSON.stringify({
      text: texts,
      target_lang: target,
      ...(!auto
        ? { source_lang: source.startsWith("ZH") ? "ZH" : source }
        : {}),
      ...(html ? { tag_handling: "html" } : {}),
    });
  } else throw new ServiceError("Unsupported translation service", false, true);
  signal.throwIfAborted();
  networkAttempt(signal);
  const response = await fetch(url, {
    method: "POST",
    headers,
    body,
    signal,
    credentials: "omit",
    redirect: "error",
  });
  if (!response.ok) {
    const raw = response.headers.get("Retry-After");
    const delay = raw
      ? Math.max(
          0,
          Number.isFinite(Number(raw))
            ? Number(raw) * 1000
            : Date.parse(raw) - Date.now(),
        )
      : 0;
    throw new ServiceError(
      `翻译服务 HTTP ${response.status} / Service HTTP ${response.status}`,
      response.status === 429 || response.status >= 500,
      [401, 403, 456].includes(response.status),
      Math.min(delay || 0, 60_000),
    );
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ServiceError("Empty service response");
  const decoder = new TextDecoder();
  let raw = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      raw += decoder.decode(chunk.value, { stream: true });
      if (raw.length > 2_000_000) {
        await reader.cancel();
        throw new ServiceError("Service response too large");
      }
    }
  } finally {
    reader.releaseLock();
  }
  let data: any;
  try {
    data = JSON.parse(raw + decoder.decode());
  } catch {
    throw new ServiceError("翻译响应格式错误 / Invalid response");
  }
  if (data.error_code)
    throw new ServiceError(
      `百度错误 / Baidu error ${String(data.error_code)
        .replace(/[^0-9]/g, "")
        .slice(0, 10)}`,
      ["54003", "52001"].includes(String(data.error_code)),
      !["54003", "52001"].includes(String(data.error_code)),
    );
  let results: unknown;
  if (provider === "baidu")
    results = Array.isArray(data.trans_result)
      ? [data.trans_result.map((x: any) => x.dst).join("\n")]
      : null;
  if (provider === "microsoft")
    results = Array.isArray(data)
      ? data.map((x) => x.translations?.[0]?.text)
      : null;
  if (provider === "google")
    results = data.data?.translations?.map((x: any) =>
      html ? x.translatedText : plainFromHtml(x.translatedText),
    );
  if (provider === "deepl")
    results = data.translations?.map((x: any) => x.text);
  if (
    !Array.isArray(results) ||
    results.length !== texts.length ||
    results.some((x) => typeof x !== "string" || !x.trim())
  )
    throw new ServiceError(
      "翻译结果缺失或顺序无法确认 / Missing translation results",
    );
  return results as string[];
}
