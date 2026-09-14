import type { ProviderType, TestConnectionResponse } from "../../shared/types";

/**
 * Connection and invocation parameters for one model profile, derived from
 * the active settings. `apiBaseUrl` is already validated and normalized.
 */
export interface ProviderConfig {
  provider: ProviderType;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  timeoutMs: number;
  maxOutputTokens: number;
  customHeaders: Record<string, string>;
  authMode: "bearer" | "x-api-key" | "both";
  enableThinking: boolean;
  /** When true, user-facing error and status messages are rendered in English. */
  english: boolean;
}

/**
 * Unified translation request (plan §7). The facade renders prompts before
 * calling a provider, so providers never see raw user settings or template
 * placeholders. `systemPrompt` is the fully rendered system instruction and
 * `userPrompt` the fully rendered user message (source text wrapped in
 * `<source_text>` tags). The page-context fields are reserved for future
 * context-aware translation.
 */
export interface TranslationRequest {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  systemPrompt: string;
  userPrompt: string;
  pageTitle?: string;
  pageUrl?: string;
  surroundingText?: string;
}

/** Unified streaming events (plan §7), extended with a reasoning channel. */
export type TranslationChunk =
  | { type: "start" }
  | { type: "reasoning"; text: string }
  | { type: "delta"; text: string }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "finish" }
  | { type: "error"; message: string };

export type TestResult = TestConnectionResponse;

/**
 * Provider abstraction (plan §7). The UI and background never depend on a
 * vendor directly; every model service is reached through this interface.
 */
export interface TranslationProvider {
  readonly id: string;
  testConnection(config: ProviderConfig, onAttempt?: () => void): Promise<TestResult>;
  translate(
    request: TranslationRequest,
    config: ProviderConfig,
    signal: AbortSignal
  ): AsyncIterable<TranslationChunk>;
}
