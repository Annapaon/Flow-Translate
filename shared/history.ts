import { storage } from "wxt/utils/storage";
import type { TranslationCacheEntry, TranslationHistoryEntry, TranslatorSettings } from "./types";

const MAX_HISTORY_ITEMS = 100;
const MAX_CACHE_ITEMS = 100;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const historyItem = storage.defineItem<TranslationHistoryEntry[]>("local:translationHistory", {
  defaultValue: []
});

const cacheItem = storage.defineItem<TranslationCacheEntry[]>("local:translationCache", {
  defaultValue: []
});

function hash(value: string): string {
  let current = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    current ^= value.charCodeAt(index);
    current = Math.imul(current, 16777619);
  }
  return (current >>> 0).toString(36);
}

export function createCacheKey(text: string, settings: TranslatorSettings): string {
  return hash(JSON.stringify([
    text,
    settings.targetLanguage,
    settings.model,
    settings.systemPrompt,
    settings.enableThinking
  ]));
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

export async function clearHistoryAndCache(): Promise<void> {
  await Promise.all([historyItem.setValue([]), cacheItem.setValue([])]);
}
