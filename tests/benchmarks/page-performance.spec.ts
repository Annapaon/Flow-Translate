import { mkdir, writeFile } from "node:fs/promises";
import { test, expect } from "../e2e/fixtures";

test("measure page latency at saved concurrency levels", async ({ extension: e }) => {
  test.setTimeout(180000);
  await e.configure("click"); e.autoFinish(60);
  const options = await e.options();
  const rows = [];
  for (const concurrency of [1, 2, 4]) for (let run = 0; run < 3; run++) {
    await e.control("restore");
    await options.evaluate(async concurrency => {
      const api = (globalThis as any).chrome;
      const { translatorSettings: s } = await api.storage.local.get("translatorSettings");
      await api.storage.local.set({ translatorSettings: { ...s, enableCache: false, modelProfiles: s.modelProfiles.map((p: any) => ({ ...p, maxConcurrency: concurrency })) } });
    }, concurrency);
    await e.page.evaluate(extraNodes => {
      document.body.innerHTML = Array.from({ length: 120 }, (_, i) => `<p>Paragraph ${i}: this is a readable sentence with an <strong>inline phrase</strong> for a consistent translation benchmark.</p>`).join("") + "<div></div>".repeat(extraNodes);
      const start = performance.now();
      (globalThis as any).bench = { start, firstMs: null };
      const observer = new MutationObserver(() => {
        if (document.querySelector('[data-flow-translation]:not([data-flow-translation="picker"])')) {
          (globalThis as any).bench.firstMs = performance.now() - start; observer.disconnect();
        }
      });
      observer.observe(document.body, { subtree: true, childList: true });
    }, Number(process.env.BENCHMARK_EXTRA_NODES || 0));
    const requests = e.requests.length;
    await e.control("start");
    await expect.poll(async () => (await e.pageStatus()).state, { timeout: 30000, intervals: [50] }).toBe("completed");
    const timings = await e.page.evaluate(() => ({ firstMs: (globalThis as any).bench.firstMs, totalMs: performance.now() - (globalThis as any).bench.start }));
    expect(timings.firstMs).toBeGreaterThan(0);
    const status = await e.pageStatus();
    expect(status.failed).toBe(0); expect(status.done).toBe(120);
    rows.push({ concurrency, run, ...timings, requests: e.requests.length - requests, internal: status.timings });
  }
  await mkdir(".output/benchmarks", { recursive: true });
  await writeFile(`.output/benchmarks/${process.env.BENCHMARK_LABEL || "current"}.json`, JSON.stringify({ environment: "local mock SSE, 60ms completion delay, 120 paragraphs, cache disabled", extraLayoutNodes: Number(process.env.BENCHMARK_EXTRA_NODES || 0), rows }, null, 2));
});
