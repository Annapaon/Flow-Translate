import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./tests/benchmarks", workers: 1, fullyParallel: false, use: { trace: "retain-on-failure" } });
