import { storage } from "wxt/utils/storage";
import type { ModelUsageEntry, TranslationCacheEntry, TranslationHistoryEntry, TranslatorSettings } from "./types";

const MAX_HISTORY_ITEMS = 100;
const MAX_CACHE_ITEMS = 100;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const historyItem = storage.defineItem<TranslationHistoryEntry[]>("local:translationHistory", {
  defaultValue: []
});

const cacheItem = storage.defineItem<TranslationCacheEntry[]>("local:translationCache", {
  defaultValue: []
});

const usageItem = storage.defineItem<ModelUsageEntry[]>("local:modelUsage", { defaultValue: [] });

/**
 * Serializes read-modify-write cycles per storage key. These functions read
 * the whole array, mutate it, and write it back, so concurrent completions
 * (e.g. a side-panel and a page translation finishing together) would
 * otherwise overwrite each other's entries. Each task's own rejection is
 * still surfaced to its caller, but the chain is reset after a failure so
 * one transient storage error never poisons subsequent writes.
 */
function createWriteQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task);
    tail = run.catch(() => undefined);
    return run;
  };
}

const queueHistoryWrite = createWriteQueue();
const queueCacheWrite = createWriteQueue();
const queueUsageWrite = createWriteQueue();

export async function createCacheKey(text: string, settings: TranslatorSettings): Promise<string> {
  const value = JSON.stringify([
    text,
    settings.targetLanguage,
    settings.sourceLanguage,
    settings.model,
    settings.provider,
    settings.apiBaseUrl,
    settings.systemPrompt,
    settings.enableThinking,
    settings.outputMode,
    settings.translationScene,
    settings.scenePrompts[settings.translationScene],
    settings.maxOutputTokens,
    settings.temperature
  ]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function findCachedTranslation(key: string): Promise<string | null> {
  // Queued because the TTL prune below writes the array back.
  return queueCacheWrite(async () => {
    const now = Date.now();
    const entries = await cacheItem.getValue();
    const validEntries = entries.filter((entry) => now - entry.createdAt < CACHE_TTL_MS);
    if (validEntries.length !== entries.length) await cacheItem.setValue(validEntries);
    return validEntries.find((entry) => entry.key === key)?.translatedText ?? null;
  });
}

export function cacheTranslation(key: string, translatedText: string): Promise<void> {
  if (!translatedText) return Promise.resolve();
  return queueCacheWrite(async () => {
    const entries = (await cacheItem.getValue()).filter((entry) => entry.key !== key);
    await cacheItem.setValue([
      { key, translatedText, createdAt: Date.now() },
      ...entries
    ].slice(0, MAX_CACHE_ITEMS));
  });
}

export function addHistory(entry: Omit<TranslationHistoryEntry, "id" | "createdAt">): Promise<void> {
  return queueHistoryWrite(async () => {
    const entries = await historyItem.getValue();
    await historyItem.setValue([
      { ...entry, id: crypto.randomUUID(), createdAt: Date.now() },
      ...entries
    ].slice(0, MAX_HISTORY_ITEMS));
  });
}

export async function getHistory(): Promise<TranslationHistoryEntry[]> {
  return historyItem.getValue();
}

export function toggleHistoryFavorite(id: string): Promise<TranslationHistoryEntry[]> {
  return queueHistoryWrite(async () => {
    const entries = (await historyItem.getValue()).map((entry) =>
      entry.id === id ? { ...entry, favorite: !entry.favorite } : entry
    );
    await historyItem.setValue(entries);
    return entries;
  });
}

export function deleteHistoryEntry(id: string): Promise<TranslationHistoryEntry[]> {
  return queueHistoryWrite(async () => {
    const entries = (await historyItem.getValue()).filter((entry) => entry.id !== id);
    await historyItem.setValue(entries);
    return entries;
  });
}

export function clearHistory(): Promise<void> {
  return queueHistoryWrite(() => historyItem.setValue([]));
}

export function clearHistoryAndCache(): Promise<void> {
  return Promise.all([
    queueHistoryWrite(() => historyItem.setValue([])),
    queueCacheWrite(() => cacheItem.setValue([]))
  ]).then(() => undefined);
}

export function recordModelUsage(modelProfileId: string, inputCharacters: number, outputCharacters: number): Promise<void> {
  return queueUsageWrite(async () => {
    const entries = await usageItem.getValue();
    const current = entries.find((entry) => entry.modelProfileId === modelProfileId);
    const next: ModelUsageEntry = {
      modelProfileId,
      requestCount: (current?.requestCount ?? 0) + 1,
      inputCharacters: (current?.inputCharacters ?? 0) + inputCharacters,
      outputCharacters: (current?.outputCharacters ?? 0) + outputCharacters,
      lastUsedAt: Date.now()
    };
    await usageItem.setValue([...entries.filter((entry) => entry.modelProfileId !== modelProfileId), next]);
  });
}

export async function getModelUsage(): Promise<ModelUsageEntry[]> {
  return usageItem.getValue();
}

export function clearModelUsage(modelProfileId: string): Promise<ModelUsageEntry[]> {
  return queueUsageWrite(async () => {
    const entries = (await usageItem.getValue()).filter((entry) => entry.modelProfileId !== modelProfileId);
    await usageItem.setValue(entries);
    return entries;
  });
}

export function clearAllModelUsage(): Promise<void> {
  return queueUsageWrite(() => usageItem.setValue([]));
}
