import type { TranslatorSettings } from "./types";

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Apply only the user's edits to the newest snapshot, including individual profile fields. */
export function mergeSettingsChanges(current: TranslatorSettings, before: TranslatorSettings, after: TranslatorSettings): TranslatorSettings {
  function merge(now: unknown, old: unknown, next: unknown): unknown {
    if (equal(old, next)) return now;
    if (Array.isArray(old) && Array.isArray(next) && [...old, ...next].every(value => isRecord(value) && typeof value.id === "string")) {
      const rows = Array.isArray(now) ? now as Array<Record<string, unknown>> : [];
      const prior = new Map(old.map(value => [value.id, value]));
      const edits = new Map(next.map(value => [value.id, value]));
      const result = rows.filter(value => !prior.has(value.id) || edits.has(value.id)).map(value => edits.has(value.id) ? merge(value, prior.get(value.id), edits.get(value.id)) : value);
      for (const value of next) if (!prior.has(value.id) && !rows.some(row => row.id === value.id)) result.push(value);
      return result;
    }
    if (isRecord(old) && isRecord(next)) {
      const result = { ...(isRecord(now) ? now : {}) };
      for (const key of new Set([...Object.keys(old), ...Object.keys(next)])) {
        if (equal(old[key], next[key])) continue;
        if (!(key in next)) delete result[key];
        else result[key] = merge(result[key], old[key], next[key]);
      }
      return result;
    }
    return next;
  }
  return merge(current, before, after) as TranslatorSettings;
}
