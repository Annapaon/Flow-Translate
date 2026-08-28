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
let usageWriteQueue = Promise.resolve();

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
    settings.maxOutputTokens
  ]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function findCachedTranslation(key: string): Promise<string | null> {
  const now = Date.now();
  const entries = await cacheItem.getValue();
  const validEntries = entries.filter((entry) => now - entry.createdAt < CACHE_TTL_MS);
  if (validEntries.length !== entries.length) await cacheItem.setValue(validEntries);
  return validEntries.find((entry) => entry.key === key)?.translatedText ?? null;
}

export async function cacheTranslation(key: string, translatedText: string): Promise<void> {
  if (!translatedText) return;
  const entries = (await cacheItem.getValue()).filter((entry) => entry.key !== key);
  await cacheItem.setValue([
    { key, translatedText, createdAt: Date.now() },
    ...entries
  ].slice(0, MAX_CACHE_ITEMS));
}

export async function addHistory(entry: Omit<TranslationHistoryEntry, "id" | "createdAt">): Promise<void> {
  const entries = await historyItem.getValue();
  await historyItem.setValue([
    { ...entry, id: crypto.randomUUID(), createdAt: Date.now() },
    ...entries
  ].slice(0, MAX_HISTORY_ITEMS));
}

export async function getHistory(): Promise<TranslationHistoryEntry[]> {
  return historyItem.getValue();
}

export async function toggleHistoryFavorite(id: string): Promise<TranslationHistoryEntry[]> {
  const entries = (await historyItem.getValue()).map((entry) =>
    entry.id === id ? { ...entry, favorite: !entry.favorite } : entry
  );
  await historyItem.setValue(entries);
  return entries;
}

export async function deleteHistoryEntry(id: string): Promise<TranslationHistoryEntry[]> {
  const entries = (await historyItem.getValue()).filter((entry) => entry.id !== id);
  await historyItem.setValue(entries);
  return entries;
}

export async function clearHistory(): Promise<void> {
  await historyItem.setValue([]);
}

export async function clearHistoryAndCache(): Promise<void> {
  await Promise.all([historyItem.setValue([]), cacheItem.setValue([])]);
}

export async function recordModelUsage(modelProfileId: string, inputCharacters: number, outputCharacters: number): Promise<void> {
  usageWriteQueue = usageWriteQueue.then(async () => {
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
  await usageWriteQueue;
}

export async function getModelUsage(): Promise<ModelUsageEntry[]> {
  return usageItem.getValue();
}

export async function clearModelUsage(modelProfileId: string): Promise<ModelUsageEntry[]> {
  const entries = (await usageItem.getValue()).filter((entry) => entry.modelProfileId !== modelProfileId);
  await usageItem.setValue(entries);
  return entries;
}

export async function clearAllModelUsage(): Promise<void> {
  await usageItem.setValue([]);
}
