import { mkdir, readFile, writeFile } from "node:fs/promises";
import { test, expect } from "vitest";
import { validateImportedSettings } from "../../src/shared/security";
import { saveSettings, getSettings } from "../../src/shared/settings";
import { DEFAULT_SETTINGS } from "../../src/shared/types";
import { streamTranslation } from "../../src/core/providers";
import { diagnose } from "../../src/core/providers/diagnostics";

// Explicit opt-in only: never read developer/browser credentials automatically.
const configPath = process.env.TRANSLATOR_TEST_SETTINGS;
test("real providers accept a short Japanese translation request", async context => {
  await mkdir(".output/acceptance", { recursive: true });
  if (!configPath) {
    await writeFile(".output/acceptance/live-services.json", JSON.stringify({ status: "not-run", reason: "TRANSLATOR_TEST_SETTINGS was not provided; no credentials were read and no provider requests were made." }, null, 2));
    context.skip(); return;
  }
  let imported;
  try { imported = validateImportedSettings(JSON.parse(await readFile(configPath, "utf8")), true); }
  catch { throw new Error("The supplied test configuration could not be read or validated. Its contents are not logged."); }
  await saveSettings({ ...DEFAULT_SETTINGS, ...imported, privacyConsentAccepted: true });
  const base = await getSettings();
  const rows = [];
  for (const [index, profile] of base.modelProfiles.filter(profile => profile.enabled).entries()) {
    const settings = { ...base, activeModelId: profile.id, provider: profile.provider, apiBaseUrl: profile.apiBaseUrl, apiKey: profile.apiKey, model: profile.model, timeoutMs: 20000, maxOutputTokens: 256, enableThinking: false, sourceLanguage: "日本語", targetLanguage: "简体中文", outputMode: "translation" as const };
    const start = performance.now();
    let firstMs: number | undefined;
    let characters = 0;
    try {
      await streamTranslation("今日は良い天気です。", settings, AbortSignal.timeout(20000), text => { if (text) firstMs ??= performance.now() - start; characters += text.length; });
      rows.push({ index, provider: profile.provider, ok: characters > 0, firstMs, totalMs: performance.now() - start, outputCharacters: characters });
    } catch (error) { rows.push({ index, provider: profile.provider, ok: false, code: diagnose(error, true).code, totalMs: performance.now() - start }); }
  }
  await writeFile(".output/acceptance/live-services.json", JSON.stringify({ status: "ran", rows, scope: "Real provider adapters only; browser host permission and semantic quality need separate acceptance." }, null, 2));
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every(row => row.ok), "Some live providers failed; see the sanitized acceptance report.").toBe(true);
});
