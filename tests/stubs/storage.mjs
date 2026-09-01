// In-memory stub of wxt/utils/storage for testing.
const store = new Map();
const watchers = new Map();

export const storage = {
  defineItem(key, options = {}) {
    return {
      async getValue() {
        if (store.has(key)) return structuredClone(store.get(key));
        return options.defaultValue !== undefined ? structuredClone(options.defaultValue) : null;
      },
      async setValue(value) {
        store.set(key, structuredClone(value));
        for (const cb of watchers.get(key) ?? []) cb(structuredClone(value), undefined);
      },
      async removeValue() {
        store.delete(key);
        for (const cb of watchers.get(key) ?? []) cb(null, undefined);
      },
      watch(cb) {
        if (!watchers.has(key)) watchers.set(key, new Set());
        watchers.get(key).add(cb);
        return () => watchers.get(key).delete(cb);
      }
    };
  },
  _dump: () => store,
  _reset: () => { store.clear(); watchers.clear(); }
};
