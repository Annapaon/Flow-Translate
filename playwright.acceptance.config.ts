import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./tests/acceptance", workers: 1, timeout: 60000, use: { trace: "off", screenshot: "off" } });
