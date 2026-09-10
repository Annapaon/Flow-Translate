import { storage } from "wxt/utils/storage";
import type { ModelUsageEntry, TranslationCacheEntry, TranslationHistoryEntry, TranslatorSettings } from "./types";
import {
  CACHE_STORE, HISTORY_STORE, USAGE_STORE,
  clearStore, getAllFromStore, openDb, withStore,
  type StoredHistoryEntry
} from "./db";

const MAX_HISTORY_ITEMS = 100;
const MAX_CACHE_ITEMS = 100;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Serializes read-modify-write cycles per store. These functions read records,
 * mutate, and write back, so concurrent completions (e.g. a side-panel and a
 * page translation finishing together) would otherwise interleave. IndexedDB
 * already serializes readwrite transactions on a store, but the JS queue also
 * guards the multi-step getAll-then-prune sequences and keeps a transient
 * failure from poisoning later writes.
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

// ---- one-time migration from the legacy chrome.storage.local layout ----
const legacyHistoryItem = storage.defineItem<TranslationHistoryEntry[]>("local:translationHistory", { defaultValue: [] });
const legacyCacheItem = storage.defineItem<TranslationCacheEntry[]>("local:translationCache", { defaultValue: [] });
const legacyUsageItem = storage.defineItem<ModelUsageEntry[]>("local:modelUsage", { defaultValue: [] });

let migrationPromise: Promise<void> | null = null;

/**
 * Imports any pre-IndexedDB data from chrome.storage.local on first use, then
 * removes the legacy keys so the migration never repeats. Idempotent and
 * memoized; every store operation awaits it first.
 */
function ensureMigrated(): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      await openDb();
      const [legacyHistory, legacyCache, legacyUsage] = await Promise.all([
        legacyHistoryItem.getValue(),
        legacyCacheItem.getValue(),
        legacyUsageItem.getValue()
      ]);
      const [existingHistory, existingCache, existingUsage] = await Promise.all([
        getAllFromStore<StoredHistoryEntry>(HISTORY_STORE),
        getAllFromStore<TranslationCacheEntry>(CACHE_STORE),
        getAllFromStore<ModelUsageEntry>(USAGE_STORE)
      ]);
      if (legacyHistory.length && existingHistory.length === 0) {
        // Legacy array is newest-first; insert oldest-first so the
        // auto-increment seq reproduces the original insertion order.
        for (const entry of [...legacyHistory].reverse()) {
          await withStore(HISTORY_STORE, "readwrite", (store) => store.add({ ...entry } as StoredHistoryEntry));
        }
      }
      if (legacyCache.length && existingCache.length === 0) {
        for (const entry of legacyCache) {
          await withStore(CACHE_STORE, "readwrite", (store) => store.put(entry));
        }
      }
      if (legacyUsage.length && existingUsage.length === 0) {
        for (const entry of legacyUsage) {
          await withStore(USAGE_STORE, "readwrite", (store) => store.put(entry));
        }
      }
      await Promise.all([legacyHistoryItem.removeValue(), legacyCacheItem.removeValue(), legacyUsageItem.removeValue()]);
    })().catch((error) => {
      migrationPromise = null;
      throw error;
    });
  }
  return migrationPromise;
}

/**
 * Test hook: clears the memoized migration so a test can seed legacy
 * chrome.storage.local data and observe the one-time import. Production code
 * never calls this.
 */
export function __resetMigrationForTests(): void {
  migrationPromise = null;
}

function stripSeq(record: StoredHistoryEntry): TranslationHistoryEntry {
  const { seq: _seq, ...entry } = record;
  return entry;
}

async function readHistoryNewestFirst(): Promise<TranslationHistoryEntry[]> {
  const records = await getAllFromStore<StoredHistoryEntry>(HISTORY_STORE);
  // getAll returns records in ascending seq (insertion) order; newest = last.
  return records.sort((a, b) => b.seq - a.seq).map(stripSeq);
}

export async function createCacheKey(text: string, settings: TranslatorSettings): Promise<string> {
  const value = JSON.stringify([
    text,
    2, settings.apiKey, settings.activeModelId, settings.customHeaders, settings.modelProfiles.find(p => p.id === settings.activeModelId)?.appId, settings.modelProfiles.find(p => p.id === settings.activeModelId)?.region,
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
  return queueCacheWrite(async () => {
    await ensureMigrated();
    const now = Date.now();
    const entries = await getAllFromStore<TranslationCacheEntry>(CACHE_STORE);
    const expired = entries.filter((entry) => now - entry.createdAt >= CACHE_TTL_MS);
    if (expired.length) {
      await withStore(CACHE_STORE, "readwrite", (store) => {
        for (const entry of expired) store.delete(entry.key);
      });
    }
    const match = entries.find((entry) => entry.key === key);
    if (match && key.startsWith("page:") && now - match.createdAt < CACHE_TTL_MS) await withStore(CACHE_STORE, "readwrite", store => store.put({ ...match, lastAccessed: now }));
    return match && now - match.createdAt < CACHE_TTL_MS ? match.translatedText : null;
  });
}

export function cacheTranslation(key: string, translatedText: string, signal?: AbortSignal): Promise<void> {
  if (!translatedText) return Promise.resolve();
  return queueCacheWrite(async () => {
    await ensureMigrated();
    await withStore(CACHE_STORE, "readwrite", (store) => {
      signal?.throwIfAborted();
      // put() overwrites by keyPath, so re-caching dedupes automatically.
      store.put({ key, translatedText, createdAt: Date.now() } satisfies TranslationCacheEntry);
      const getAll = store.getAll() as IDBRequest<TranslationCacheEntry[]>;
      getAll.onsuccess = () => {
        const page = key.startsWith("page:");
        const all = getAll.result.filter(e => e.key.startsWith("page:") === page);
        if (page) {
          let size = all.reduce((n, e) => n + e.translatedText.length * 2 + e.key.length * 2, 0);
          for (const e of all.sort((a,b) => (a.lastAccessed ?? a.createdAt) - (b.lastAccessed ?? b.createdAt))) { if (size <= 10 * 1024 * 1024) break; store.delete(e.key); size -= e.translatedText.length * 2 + e.key.length * 2; }
        } else if (all.length > MAX_CACHE_ITEMS) {
          const oldestFirst = all.sort((a, b) => a.createdAt - b.createdAt);
          for (const entry of oldestFirst.slice(0, all.length - MAX_CACHE_ITEMS)) store.delete(entry.key);
        }
      };
    });
  });
}

export function addHistory(entry: Omit<TranslationHistoryEntry, "id" | "createdAt">, signal?: AbortSignal): Promise<void> {
  return queueHistoryWrite(async () => {
    await ensureMigrated();
    await withStore(HISTORY_STORE, "readwrite", (store) => {
      signal?.throwIfAborted();
      const record = { ...entry, id: crypto.randomUUID(), createdAt: Date.now() } as StoredHistoryEntry;
      store.add(record); // seq is auto-assigned
      const getAll = store.getAll() as IDBRequest<StoredHistoryEntry[]>;
      getAll.onsuccess = () => {
        const all = getAll.result;
        if (all.length > MAX_HISTORY_ITEMS) {
          const oldestFirst = all.sort((a, b) => a.seq - b.seq);
          for (const extra of oldestFirst.slice(0, all.length - MAX_HISTORY_ITEMS)) store.delete(extra.seq);
        }
      };
    });
  });
}

export async function getHistory(): Promise<TranslationHistoryEntry[]> {
  await ensureMigrated();
  return readHistoryNewestFirst();
}

export function toggleHistoryFavorite(id: string): Promise<TranslationHistoryEntry[]> {
  return queueHistoryWrite(async () => {
    await ensureMigrated();
    const records = await getAllFromStore<StoredHistoryEntry>(HISTORY_STORE);
    const target = records.find((record) => record.id === id);
    if (target) {
      await withStore(HISTORY_STORE, "readwrite", (store) => store.put({ ...target, favorite: !target.favorite }));
    }
    return readHistoryNewestFirst();
  });
}

export function deleteHistoryEntry(id: string): Promise<TranslationHistoryEntry[]> {
  return queueHistoryWrite(async () => {
    await ensureMigrated();
    const records = await getAllFromStore<StoredHistoryEntry>(HISTORY_STORE);
    const target = records.find((record) => record.id === id);
    if (target) {
      await withStore(HISTORY_STORE, "readwrite", (store) => store.delete(target.seq));
    }
    return readHistoryNewestFirst();
  });
}

export function clearHistory(): Promise<void> {
  return queueHistoryWrite(async () => {
    await ensureMigrated();
    await clearStore(HISTORY_STORE);
  });
}

export function clearHistoryAndCache(): Promise<void> {
  return Promise.all([
    queueHistoryWrite(async () => { await ensureMigrated(); await clearStore(HISTORY_STORE); }),
    queueCacheWrite(async () => { await ensureMigrated(); await clearStore(CACHE_STORE); })
  ]).then(() => undefined);
}

export function recordModelUsage(modelProfileId: string, inputCharacters: number, outputCharacters: number): Promise<void> {
  return queueUsageWrite(async () => {
    await ensureMigrated();
    await withStore(USAGE_STORE, "readwrite", (store) => {
      const get = store.get(modelProfileId) as IDBRequest<ModelUsageEntry | undefined>;
      get.onsuccess = () => {
        const current = get.result;
        store.put({
          ...current,
          modelProfileId,
          requestCount: (current?.requestCount ?? 0) + 1,
          inputCharacters: (current?.inputCharacters ?? 0) + inputCharacters,
          outputCharacters: (current?.outputCharacters ?? 0) + outputCharacters,
          lastUsedAt: Date.now()
        } satisfies ModelUsageEntry);
      };
    });
  });
}

export async function getModelUsage(): Promise<ModelUsageEntry[]> {
  await ensureMigrated();
  return getAllFromStore<ModelUsageEntry>(USAGE_STORE);
}

export function clearModelUsage(modelProfileId: string): Promise<ModelUsageEntry[]> {
  return queueUsageWrite(async () => {
    await ensureMigrated();
    await withStore(USAGE_STORE, "readwrite", (store) => store.delete(modelProfileId));
    return getAllFromStore<ModelUsageEntry>(USAGE_STORE);
  });
}

export function clearAllModelUsage(): Promise<void> {
  return queueUsageWrite(async () => {
    await ensureMigrated();
    await clearStore(USAGE_STORE);
  });
}

/** Network attempts are recorded even when a request is cancelled or fails. */
export function recordServiceCalls(modelProfileId: string, count: number): Promise<void> {
  return queueUsageWrite(async () => {
    await ensureMigrated();
    await withStore(USAGE_STORE, "readwrite", store => {
      const request = store.get(modelProfileId) as IDBRequest<ModelUsageEntry | undefined>;
      request.onsuccess = () => {
        const current = request.result;
        store.put({ modelProfileId, requestCount: 0, inputCharacters: 0, outputCharacters: 0, ...current, serviceCallCount: (current?.serviceCallCount ?? 0) + count, lastUsedAt: Date.now() } satisfies ModelUsageEntry);
      };
    });
  });
}
