import { z } from "zod";
import type { ProviderType, TranslatorSettings } from "./types";

const providerSchema = z.enum(["openai-compatible", "anthropic", "gemini", "ollama", "lm-studio", "xinference", "vllm", "sglang"]);
const headerName = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export function validateApiUrl(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("API URL 格式无效"); }
  if (url.username || url.password || url.hash) throw new Error("API URL 不得包含用户名、密码或片段");
  const local = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new Error("仅允许 HTTPS；本地服务可使用 localhost、127.0.0.1 或 ::1 的 HTTP 地址");
  }
  return url.toString().replace(/\/$/, "");
}

export function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const entries = Object.entries(headers).slice(0, 20).map(([name, value]) => {
    const trimmedName = name.trim();
    const trimmedValue = String(value).trim();
    if (!headerName.test(trimmedName) || /[\r\n]/.test(trimmedValue) || trimmedName.length > 100 || trimmedValue.length > 2_000) {
      throw new Error("自定义请求头包含非法名称、换行或过长内容");
    }
    return [trimmedName, trimmedValue] as const;
  });
  return Object.fromEntries(entries);
}

const profileSchema = z.object({
  id: z.string().min(1).max(100), enabled: z.boolean(), provider: providerSchema,
  name: z.string().min(1).max(100), apiBaseUrl: z.string().min(1).max(2_000), apiKey: z.string().max(8_000),
  model: z.string().min(1).max(300), temperature: z.number().min(0).max(2), timeoutMs: z.number().int().min(5_000).max(300_000),
  maxOutputTokens: z.number().int().min(64).max(131_072), customHeaders: z.record(z.string(), z.string()),
  authMode: z.enum(["bearer", "x-api-key", "both"]).optional().default("bearer")
}).strict();

const scenePromptsSchema = z.object({
  general: z.string().max(20_000), technical: z.string().max(20_000),
  academic: z.string().max(20_000), business: z.string().max(20_000)
}).strict();

const importSchema = z.object({
  modelProfiles: z.array(profileSchema).min(1).max(30), activeModelId: z.string().max(100).optional(),
  uiLanguage: z.enum(["zh-CN", "en"]).optional(), targetLanguage: z.string().min(1).max(100).optional(),
  sourceLanguage: z.string().min(1).max(100).optional(), outputMode: z.enum(["translation", "explanation", "vocabulary", "grammar"]).optional(),
  translationScene: z.enum(["general", "technical", "academic", "business"]).optional(),
  triggerMode: z.enum(["click", "auto"]).optional(), enableThinking: z.boolean().optional(),
  enableHistory: z.boolean().optional(), enableCache: z.boolean().optional(), siteAccessMode: z.enum(["blacklist", "whitelist"]).optional(),
  minChars: z.number().int().min(1).max(100).optional(), maxChars: z.number().int().min(100).max(20_000).optional(),
  systemPrompt: z.string().max(20_000).optional(), blockedSites: z.array(z.string().max(255)).max(500).optional(),
  allowedSites: z.array(z.string().max(255)).max(500).optional(), scenePrompts: scenePromptsSchema.optional()
}).strip();

export function validateImportedSettings(value: unknown): Partial<TranslatorSettings> {
  const parsed = importSchema.parse(value);
  for (const profile of parsed.modelProfiles) {
    profile.apiBaseUrl = validateApiUrl(profile.apiBaseUrl);
    profile.customHeaders = sanitizeHeaders(profile.customHeaders);
  }
  // Consent is device-specific and must be granted again after every import.
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
  return provider === "openai-compatible" || provider === "anthropic" || provider === "gemini";
}
