import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";
export default defineConfig({ plugins: [WxtVitest()], test: { environment: "node", setupFiles: ["./tests/setup.ts"], include: ["tests/live/**/*.test.ts"], testTimeout: 180000 } });
