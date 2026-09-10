import type { ProviderType } from "../../shared/types";
import { anthropicProvider } from "./anthropic";
import { geminiProvider } from "./gemini";
import { openAiCompatibleProvider } from "./openai-compatible";
import type { TranslationProvider } from "./types";

/**
 * Maps every supported provider type to its protocol implementation. All
 * local inference servers (Ollama, LM Studio, Xinference, vLLM, SGLang) speak
 * the OpenAI chat-completions protocol through their `/v1` compatibility
 * endpoints, so they share the openai-compatible implementation; their
 * distinct defaults live in PROVIDER_PRESETS below.
 */
const providers: Partial<Record<ProviderType, TranslationProvider>> = {
  "openai-compatible": openAiCompatibleProvider,
  anthropic: anthropicProvider,
  gemini: geminiProvider,
  ollama: openAiCompatibleProvider,
  "lm-studio": openAiCompatibleProvider,
  xinference: openAiCompatibleProvider,
  vllm: openAiCompatibleProvider,
  sglang: openAiCompatibleProvider
};

export function getProvider(type: ProviderType): TranslationProvider {
  const provider = providers[type];
  if (!provider) throw new Error("Unsupported LLM provider");
  return provider;
}

export interface ProviderPreset {
  id: ProviderType;
  /** Chinese display name (settings UI, zh-CN). */
  name: string;
  /** English display name (settings UI, en). */
  englishName: string;
  defaultUrl: string;
  modelPlaceholder: string;
  englishModelPlaceholder: string;
}

/**
 * Single source of truth for provider metadata shown in the settings UI, so
 * the options page never hardcodes vendor defaults itself (plan §7: the UI
 * must not depend on any model vendor directly).
 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: "baidu", name: "百度翻译", englishName: "Baidu Translate", defaultUrl: "https://fanyi-api.baidu.com/api/trans/vip/translate", modelPlaceholder: "", englishModelPlaceholder: "" },
  { id: "microsoft", name: "Microsoft / 必应翻译", englishName: "Microsoft Translate", defaultUrl: "https://api.cognitive.microsofttranslator.com/translate", modelPlaceholder: "", englishModelPlaceholder: "" },
  { id: "google", name: "Google 翻译", englishName: "Google Translate", defaultUrl: "https://translation.googleapis.com/language/translate/v2", modelPlaceholder: "", englishModelPlaceholder: "" },
  { id: "deepl", name: "DeepL 翻译", englishName: "Deepl Translate", defaultUrl: "https://api-free.deepl.com/v2/translate", modelPlaceholder: "", englishModelPlaceholder: "" },
  { id: "openai-compatible", name: "OpenAI（兼容接口）", englishName: "OpenAI (compatible API)", defaultUrl: "https://api.openai.com/v1", modelPlaceholder: "gpt-4.1-mini", englishModelPlaceholder: "gpt-4.1-mini" },
  { id: "anthropic", name: "Anthropic（兼容接口）", englishName: "Anthropic (compatible API)", defaultUrl: "https://api.anthropic.com/v1", modelPlaceholder: "claude-sonnet-4-5、ark-code-latest 或服务商模型名", englishModelPlaceholder: "claude-sonnet-4-5, ark-code-latest, or your provider's model id" },
  { id: "gemini", name: "Gemini（Google 原生）", englishName: "Gemini (Google native)", defaultUrl: "https://generativelanguage.googleapis.com/v1beta", modelPlaceholder: "gemini-2.5-flash", englishModelPlaceholder: "gemini-2.5-flash" },
  { id: "ollama", name: "Ollama（本地）", englishName: "Ollama (local)", defaultUrl: "http://localhost:11434/v1", modelPlaceholder: "qwen3:8b", englishModelPlaceholder: "qwen3:8b" },
  { id: "lm-studio", name: "LM Studio（本地）", englishName: "LM Studio (local)", defaultUrl: "http://localhost:1234/v1", modelPlaceholder: "已加载的模型名称", englishModelPlaceholder: "Name of a loaded model" },
  { id: "xinference", name: "Xinference（本地）", englishName: "Xinference (local)", defaultUrl: "http://localhost:9997/v1", modelPlaceholder: "模型 UID", englishModelPlaceholder: "Model UID" },
  { id: "vllm", name: "vLLM（本地）", englishName: "vLLM (local)", defaultUrl: "http://localhost:8000/v1", modelPlaceholder: "启动服务时指定的模型名称", englishModelPlaceholder: "Model name given at server startup" },
  { id: "sglang", name: "SGLang（本地）", englishName: "SGLang (local)", defaultUrl: "http://localhost:30000/v1", modelPlaceholder: "启动服务时指定的模型名称", englishModelPlaceholder: "Model name given at server startup" }
];

const FALLBACK_PRESET: ProviderPreset = {
  id: "openai-compatible", name: "OpenAI（兼容接口）", englishName: "OpenAI (compatible API)",
  defaultUrl: "https://api.openai.com/v1", modelPlaceholder: "gpt-4.1-mini", englishModelPlaceholder: "gpt-4.1-mini"
};

export function findProviderPreset(provider: ProviderType): ProviderPreset {
  return PROVIDER_PRESETS.find((item) => item.id === provider) ?? FALLBACK_PRESET;
}

export function providerDisplayName(provider: ProviderType, english: boolean): string {
  const preset = findProviderPreset(provider);
  return english ? preset.englishName : preset.name;
}
