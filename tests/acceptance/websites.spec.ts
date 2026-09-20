import { mkdir, writeFile } from "node:fs/promises";
import { test, expect } from "../e2e/fixtures";

const urls = process.env.TRANSLATOR_TEST_URLS?.split(",") || [
  "https://ja.wikipedia.org/wiki/日本語",
  "https://developer.mozilla.org/ja/docs/Web/JavaScript"
];
for (const [index, url] of urls.entries()) test(`public website compatibility ${index + 1}`, async ({ extension: e }, testInfo) => {
  await e.configure("click"); e.autoFinish(40);
  await mkdir(".output/acceptance", { recursive: true });
  const report: { url: string; translationService: string; status: string; reason: string; details?: unknown } = { url, translationService: "local mock", status: "not-run", reason: "" };
  const panel = await e.options();
  const pageId = await panel.evaluate(async () => {
    const tabs = await (globalThis as any).chrome.tabs.query({});
    return tabs.find((tab: any) => tab.url?.startsWith("http://127.0.0.1")).id;
  });
  let navigated = false;
  try {
    try { await e.page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 }); }
    catch (error) { report.reason = error instanceof Error ? (error.message.match(/net::[A-Z_]+|Timeout \d+ms exceeded/)?.[0] || "Website navigation failed") : "Website navigation failed"; testInfo.skip(true, report.reason); return; }
    navigated = true;
    await expect(e.page.locator("#flow-translate-root")).toBeAttached();
    const command = (action: string) => panel.evaluate(async ({ pageId, action }) => {
      return (globalThis as any).chrome.tabs.sendMessage(pageId, { type: "page-control", action });
    }, { pageId, action });
    const status = () => panel.evaluate(async pageId => (globalThis as any).chrome.tabs.sendMessage(pageId, { type: "page-status" }), pageId);
    await expect.poll(async () => (await status()).unavailableReason).toBeUndefined();
    report.details = { start: await command("start") };

    try { await expect(e.page.locator("[data-flow-translation]").first()).toBeVisible({ timeout: 20000 }); }
    finally { report.details = { ...(report.details as object), final: await status(), requests: e.requests.length }; }
    await command("restore");
    await expect(e.page.locator("[data-flow-translation]")).toHaveCount(0);
    report.status = "passed";
    report.reason = "Real website DOM translated with a local mock, then restored. This does not validate real provider quality.";
  } catch (error) {
    if (navigated) { report.status = "failed"; report.reason = "Translation insertion or restoration failed; see the test failure."; }
    throw error;
  } finally { await writeFile(`.output/acceptance/website-${index + 1}.json`, JSON.stringify(report, null, 2)); }
});
