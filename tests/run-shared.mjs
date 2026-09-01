// Test launcher: runs test-shared.mjs with "wxt/utils/storage" aliased to
// the in-memory stub in tests/stubs/. The alias must be set programmatically
// (not via JITI_ALIAS) because env-var values are relative to the importing
// file, which differs between tests/ and shared/.
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";

const stubPath = fileURLToPath(new URL("./stubs/storage.mjs", import.meta.url));
const jiti = createJiti(import.meta.url, {
  alias: { "wxt/utils/storage": stubPath }
});
await jiti.import("./test-shared.mjs");
