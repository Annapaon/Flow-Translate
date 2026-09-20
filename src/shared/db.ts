/**
 * Minimal IndexedDB layer for translation history, cache, and usage (plan §3).
 * IndexedDB replaces chrome.storage.local for these potentially larger data
 * sets, giving higher quota and structured per-record storage.
 *
 * Stores:
 * - history: auto-increment `seq` key preserves insertion order (so
 *   getHistory can return newest-first deterministically even when many
 *   entries share a createdAt millisecond); `id` is the public uuid.
 * - cache:   keyPath `key` (SHA-256 digest); put overwrites, deduping.
 * - usage:   keyPath `modelProfileId`.
 */
import type { ModelUsageEntry, TranslationCacheEntry, TranslationHistoryEntry } from "./types";

const DB_NAME = "flow-translate";
const DB_VERSION = 2;

export const SETTINGS_STORE = "private-settings";

export const HISTORY_STORE = "history";
export const CACHE_STORE = "cache";
export const USAGE_STORE = "usage";

/** A history record as persisted: the public entry plus its ordering key. */
export type StoredHistoryEntry = TranslationHistoryEntry & { seq: number };

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) db.createObjectStore(SETTINGS_STORE);
        if (!db.objectStoreNames.contains(HISTORY_STORE)) {
          db.createObjectStore(HISTORY_STORE, { keyPath: "seq", autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(CACHE_STORE)) {
          db.createObjectStore(CACHE_STORE, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(USAGE_STORE)) {
          db.createObjectStore(USAGE_STORE, { keyPath: "modelProfileId" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("IndexedDB open blocked"));
    }).catch((error) => {
      // Allow a later attempt to retry instead of caching a rejected promise.
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

/** Wraps an IDBRequest in a promise. */
export function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Runs `work` inside a single transaction on one store and resolves when the
 * transaction completes. Issuing all requests synchronously (including from
 * onsuccess handlers) keeps the transaction alive until the work is done.
 */
export function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
  return openDb().then((db) => new Promise<T | undefined>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    let result: T | undefined;
    const request = work(transaction.objectStore(storeName));
    if (request) request.onsuccess = () => { result = request.result; };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("Transaction aborted"));
  }));
}

/**
 * Test hook: closes the memoized connection and clears it so the next
 * operation reopens a fresh database (used with indexedDB.deleteDatabase
 * between tests). Not referenced by production code.
 */
export async function closeDbForTests(): Promise<void> {
  if (dbPromise) {
    const pending = dbPromise;
    dbPromise = null;
    try { (await pending).close(); } catch { /* Already closed. */ }
  }
}

export async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  return (await withStore<T[]>(storeName, "readonly", (store) => store.getAll())) ?? [];
}

export async function clearStore(storeName: string): Promise<void> {
  await withStore(storeName, "readwrite", (store) => store.clear());
}

export type { ModelUsageEntry, TranslationCacheEntry, TranslationHistoryEntry };
