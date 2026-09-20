import { translationStyleSchema, siteRulesSchema } from "./reading-settings";
import { isMachine } from "./provider-list";
import { z } from "zod";
import type { ProviderType, TranslatorSettings } from "./types";

const providerSchema = z.enum(["openai-compatible", "anthropic", "gemini", "ollama", "lm-studio", "xinference", "vllm", "sglang", "baidu", "microsoft", "google"]);
const headerName = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function parseIpv4(hostname: string): [number, number, number, number] | null {
  const match = hostname.match(ipv4Pattern);
  if (!match) return null;
  const octets = match.slice(1).map((part) => Number(part));
  if (octets.some((octet) => octet > 255)) return null;
  return octets as [number, number, number, number];
}

/** Hosts already covered by the extension's static host permissions. */
export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host === "::1") return true;
  const ipv4 = parseIpv4(host);
  return Boolean(ipv4 && ipv4[0] === 127);
}

/**
 * Hosts that may be reached over plain HTTP: loopback, RFC 1918 private
 * ranges, 169.254/16 link-local, IPv6 ULA (fc00::/7) and link-local
 * (fe80::/10), IPv4-mapped forms of those addresses, and mDNS `.local`
 * hostnames that only resolve inside a local network.
 */
export function isLocalNetworkHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isLoopbackHost(host)) return true;
  // Some local services advertise 0.0.0.0; reaching it never leaves the device.
  if (host === "0.0.0.0") return true;
  const ipv4 = parseIpv4(host);
  if (ipv4) {
    const [a, b] = ipv4;
    return a === 10
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 169 && b === 254);
  }
  if (host.includes(":")) {
    // IPv6: unique-local (fc00::/7) or link-local (fe80::/10).
    if (host.startsWith("fc") || host.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(host)) return true;
    const mapped = host.match(/^::ffff:(.+)$/);
    if (mapped?.[1]) {
      if (isLocalNetworkHost(mapped[1])) return true;
      // WHATWG URL serializes IPv4-mapped addresses in hex form, e.g.
      // ::ffff:c0a8:1 for 192.168.0.1. Convert back to dotted quads.
      const hexGroups = mapped[1].match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
      if (hexGroups) {
        const high = Number.parseInt(hexGroups[1]!, 16);
        const low = Number.parseInt(hexGroups[2]!, 16);
        return isLocalNetworkHost(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
      }
      return false;
    }
    return false;
  }
  return host.endsWith(".local");
}

export function validateApiUrl(value: string, english = false): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error(english ? "Invalid API URL" : "API URL 格式无效"); }
  if (url.username || url.password || url.hash) throw new Error(english ? "The API URL must not contain a username, password, or fragment" : "API URL 不得包含用户名、密码或片段");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalNetworkHost(url.hostname))) {
    throw new Error(english
      ? "Only HTTPS is allowed; plain HTTP is supported for loopback (localhost, 127.0.0.1, ::1) and private network addresses only (e.g. 192.168.*.*, 10.*.*.*, 172.16–172.31.*.*, 169.254.*.*, *.local)"
      : "仅允许 HTTPS；HTTP 仅支持本机（localhost、127.0.0.1、::1）和局域网地址（如 192.168.*.*、10.*.*.*、172.16–172.31.*.*、169.254.*.*、*.local）");
  }
  return url.toString().replace(/\/$/, "");
}

export function sanitizeHeaders(headers: Record<string, string>, english = false): Record<string, string> {
  const entries = Object.entries(headers).slice(0, 20).map(([name, value]) => {
    const trimmedName = name.trim();
    const trimmedValue = String(value).trim();
    if (!headerName.test(trimmedName) || /[\r\n]/.test(trimmedValue) || trimmedName.length > 100 || trimmedValue.length > 2_000) {
      throw new Error(english ? "Custom headers contain an invalid name, a line break, or are too long" : "自定义请求头包含非法名称、换行或过长内容");
    }
    return [trimmedName, trimmedValue] as const;
  });
  return Object.fromEntries(entries);
}

const profileSchema = z.object({
  kind: z.enum(["llm", "machine"]).optional(), appId: z.string().max(300).optional(), region: z.string().max(100).optional(),
  id: z.string().min(1).max(100), enabled: z.boolean(), provider: providerSchema,
  name: z.string().min(1).max(100), apiBaseUrl: z.string().min(1).max(2_000), apiKey: z.string().max(8_000),
  model: z.string().max(300), temperature: z.number().min(0).max(2), timeoutMs: z.number().int().min(5_000).max(300_000),
  maxConcurrency: z.number().int().min(1).max(6).optional(),
  maxOutputTokens: z.number().int().min(64).max(131_072), customHeaders: z.record(z.string(), z.string()),
  authMode: z.enum(["bearer", "x-api-key", "both"]).optional().default("bearer")
}).strict();

const scenePromptsSchema = z.object({
  general: z.string().max(20_000), technical: z.string().max(20_000),
  academic: z.string().max(20_000), business: z.string().max(20_000)
}).strict();

const importSchema = z.object({
  translationStyle: translationStyleSchema.optional(),
  siteRules: siteRulesSchema.optional(),
  separateModels: z.boolean().optional(),
  featureModels: z.object({ selection: z.string().max(100).optional(), page: z.string().max(100).optional(), longText: z.string().max(100).optional() }).strict().optional(),
  pageTranslationEnabled: z.boolean().optional(),
  pageTranslationMode: z.enum(["manual", "auto"]).optional(),
  schemaVersion: z.number().int().min(1).max(2).optional(),
  bidirectional: z.boolean().optional(), pairSourceLanguage: z.string().min(1).max(100).optional(), pairLanguage: z.string().min(1).max(100).optional(), smartOutput: z.boolean().optional(),
  terms: z.array(z.object({ source: z.string().max(200), target: z.string().max(300), sourceLanguage: z.string().max(100), targetLanguage: z.string().max(100), preserve: z.boolean() }).strict()).max(100).optional(),
  modelProfiles: z.array(profileSchema).min(1).max(30), activeModelId: z.string().max(100).optional(),
  uiLanguage: z.enum(["zh-CN", "en"]).optional(), keyStorage: z.enum(["local", "session"]).optional(),
  targetLanguage: z.string().min(1).max(100).optional(),
  sourceLanguage: z.string().min(1).max(100).optional(), outputMode: z.enum(["translation", "explanation", "vocabulary", "grammar"]).optional(),
  translationScene: z.enum(["general", "technical", "academic", "business"]).optional(),
  triggerMode: z.enum(["click", "auto"]).optional(), enableThinking: z.boolean().optional(),
  enableHistory: z.boolean().optional(), enableCache: z.boolean().optional(), siteAccessMode: z.enum(["blacklist", "whitelist"]).optional(),
  minChars: z.number().int().min(1).max(100).optional(), maxChars: z.number().int().min(100).max(20_000).optional(),
  systemPrompt: z.string().max(20_000).optional(), blockedSites: z.array(z.string().max(255)).max(500).optional(),
  allowedSites: z.array(z.string().max(255)).max(500).optional(), sensitiveDefaultsApplied: z.boolean().optional(),
  scenePrompts: scenePromptsSchema.optional()
}).strip();

export function validateImportedSettings(value: unknown, english = false): Partial<TranslatorSettings> {
  // Retired services: strip their profiles so the rest of a previously
  // exported configuration still imports; only reject when nothing remains.
  if (value && typeof value === "object" && Array.isArray((value as { modelProfiles?: unknown }).modelProfiles)) {
    const profiles = (value as { modelProfiles: unknown[] }).modelProfiles
      .filter(profile => !(profile && typeof profile === "object" && (profile as { provider?: unknown }).provider === "deepl"));
    if (profiles.length === 0) {
      throw new Error(english
        ? "This file only contains DeepL profiles, and DeepL is no longer supported."
        : "配置文件只包含 DeepL 服务，而 DeepL 已不再支持。");
    }
    (value as { modelProfiles: unknown[] }).modelProfiles = profiles;
  }
  const parsed = importSchema.parse(value);
  for (const profile of parsed.modelProfiles) {
    if (!isMachine(profile.provider) && !profile.model.trim()) throw new Error("模型名称不能为空 / Model is required");
    if (profile.provider === "baidu" && !profile.appId?.trim()) throw new Error("百度 App ID 不能为空 / Baidu App ID is required");
    profile.apiBaseUrl = validateApiUrl(profile.apiBaseUrl, english);
    profile.customHeaders = sanitizeHeaders(profile.customHeaders, english);
  }
  // Never trust consent from a file. The import UI preserves local consent or obtains it explicitly.
  return { ...parsed, privacyConsentAccepted: false } as Partial<TranslatorSettings>;
}

export function redactSensitive(value: string, secrets: string[] = []): string {
  let result = value;
  for (const secret of secrets.filter((item) => item.length >= 4)) result = result.split(secret).join("[REDACTED]");
  return result
    .replace(/(authorization|x-api-key|x-goog-api-key)(["'\s:=]+)(bearer\s+)?[^\s,"'}]+/gi, "$1$2[REDACTED]")
    .replace(/([?&](?:key|api_key|apikey|token)=)[^&\s]+/gi, "$1[REDACTED]");
}

export function providerRequiresApiKey(provider: ProviderType): boolean {
  return isMachine(provider) || provider === "openai-compatible" || provider === "anthropic" || provider === "gemini";
}
