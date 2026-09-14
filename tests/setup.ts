// Global test setup: in-memory IndexedDB + WXT fake browser, reset per test.
import "fake-indexeddb/auto";
import { beforeEach } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

// Imported lazily inside beforeEach: pulling shared/db and shared/history in
// at the top level would evaluate @wxt-dev/browser (via wxt/utils/storage)
// before the WXT vitest plugin's virtual:wxt-setup stubs the `browser`
// global, freezing `browser` to undefined for every later storage access.

async function deleteDatabase(): Promise<void> {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase("flow-translate");
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  // Clear extension storage/listeners, the memoized migration, and the
  // IndexedDB database so every test starts from a clean slate.
  fakeBrowser.reset();
  const { closeDbForTests } = await import("../src/shared/db");
  const { __resetMigrationForTests } = await import("../src/shared/history");
  __resetMigrationForTests();
  await closeDbForTests();
  await deleteDatabase();
});
