import { test, expect, select } from "./fixtures";
import { DEFAULT_SETTINGS } from "../../src/shared/types";
test("whole page preserves inline formats, updates dynamic text and restores original nodes", async ({
  extension: e,
}) => {
  await e.configure("click");
  await e.machine();
  await e.page.evaluate(() => {
    (window as any).original = document.querySelector("#first")!.firstChild;
  });
  await e.control("start");
  await expect.poll(async () => (await e.pageStatus()).state).toBe("completed");
  await expect(e.page.locator("#first [data-flow-translation]")).toContainText(
    "第一",
  );
  await expect(
    e.page.locator("#second [data-flow-translation] strong"),
  ).toHaveText("嵌套文字");
  expect(
    e.requests.some((r) => r.source.includes("Input selection text")),
  ).toBe(false);
  expect(
    e.requests.some((r) => r.source.includes("Textarea selection text")),
  ).toBe(false);
  await e.page.evaluate(() => {
    const p = document.createElement("p");
    p.id = "dynamic";
    p.textContent = "First dynamic text";
    document.body.append(p);
  });
  await expect(
    e.page.locator("#dynamic [data-flow-translation]"),
  ).toContainText("第一");
  await e.control("restore");
  await expect(e.page.locator("[data-flow-translation]")).toHaveCount(0);
  expect(
    await e.page.evaluate(
      () =>
        document.querySelector("#first")!.firstChild ===
        (window as any).original,
    ),
  ).toBe(true);
});
test("pause cancels streams and resume translates only unfinished blocks", async ({
  extension: e,
}) => {
  await e.configure("click");
  await e.control("start");
  await expect.poll(() => e.requests.length).toBeGreaterThan(0);
  await e.control("pause");
  await expect.poll(() => e.requests.every((r) => r.aborted)).toBe(true);
  const before = e.requests.length;
  await e.page.waitForTimeout(500);
  expect(e.requests.length).toBe(before);
  expect((await e.pageStatus()).state).toBe("paused");
  await e.machine();
  await e.control("resume");
  await expect.poll(async () => (await e.pageStatus()).state).toBe("completed");
  await expect(e.page.locator("[data-flow-translation]").first()).toBeVisible();
  await e.page.evaluate(() => history.pushState({}, "", "/route"));
  await expect(e.page.locator("[data-flow-translation]")).toHaveCount(0);
});
for (const provider of ["baidu", "google"] as const)
  test(`${provider} works through the real extension background`, async ({
    extension: e,
  }) => {
    await e.configure("click");
    await e.machine(provider);
    await select(e.page, "#first");
    await e.page
      .getByRole("button", { name: "Translate selection", exact: true })
      .click();
    await expect(e.page.locator(".result")).toContainText("第一");
    await expect(e.page.locator(".foot")).toContainText("默认模型");
    await expect.poll(() => e.requests.length).toBe(1);
    await expect(
      e.page.getByRole("button", { name: "Edit", exact: true }),
    ).toBeVisible();
    const count = e.requests.length;
    await e.page
      .getByRole("button", { name: "Translate again", exact: true })
      .click();
    await expect.poll(() => e.requests.length).toBe(count + 1);
  });
test("bidirectional options preserve the old target and apply Japanese direction", async ({
  extension: e,
}) => {
  await e.configure("click");
  await e.machine();
  const options = await e.options();
  await options.getByRole("button", { name: /Languages and behavior/ }).click();
  await options
    .getByRole("switch", { name: "Bidirectional translation", exact: true })
    .check();
  await expect(
    options.getByRole("combobox", { name: "Second language", exact: true }),
  ).toBeVisible();
  await expect(
    options.getByRole("combobox", {
      name: "Target language",
      exact: true,
    }),
  ).toHaveCount(0);
  await e.page
    .locator("#first")
    .evaluate((el) => (el.textContent = "今日は良い天気です"));
  await select(e.page, "#first");
  await e.page
    .getByRole("button", { name: "Translate selection", exact: true })
    .click();
  await expect(e.page.locator(".brand")).toContainText("简体中文");
  await options
    .getByRole("switch", { name: "Bidirectional translation", exact: true })
    .uncheck();
  await expect(
    options.getByRole("combobox", {
      name: "Target language",
      exact: true,
    }),
  ).toBeEnabled();
});

test("site pause cancels page work, suppresses selection triggers and resumes cleanly", async ({
  extension: e,
}) => {
  await e.configure("click");
  const options = await e.options();
  await e.page.bringToFront();
  await e.control("start");
  await expect.poll(() => e.requests.length).toBeGreaterThan(0);
  await options.evaluate(() =>
    (globalThis as any).chrome.runtime.sendMessage({
      type: "site-pause",
      mode: "session",
    }),
  );
  await expect.poll(() => e.requests.every((r) => r.aborted)).toBe(true);
  await expect.poll(async () => (await e.pageStatus()).state).toBe("idle");
  await select(e.page, "#second");
  await expect(
    e.page.getByRole("button", { name: "Translate selection", exact: true }),
  ).toHaveCount(0);
  await options.evaluate(() =>
    (globalThis as any).chrome.runtime.sendMessage({
      type: "site-pause",
      mode: "resume",
    }),
  );
  await expect(async () => {
    await select(e.page, "#first");
    await expect(
      e.page.getByRole("button", { name: "Translate selection", exact: true }),
    ).toBeVisible();
  }).toPass();
});

test("changing settings pauses page work and machine translation ignores saved LLM output mode", async ({
  extension: e,
}) => {
  await e.configure("click");
  await e.control("start");
  await expect.poll(() => e.requests.length).toBeGreaterThan(0);
  await e.settings({ featurePreferences: { ...DEFAULT_SETTINGS.featurePreferences, page: { ...DEFAULT_SETTINGS.featurePreferences.page, targetLanguage: "日本語" } } });
  await expect.poll(async () => (await e.pageStatus()).state).toBe("paused");
  await expect.poll(() => e.requests.every((r) => r.aborted)).toBe(true);
  await e.control("restore");
  await e.machine();
  await e.settings({ outputMode: "grammar", enableThinking: true });
  await select(e.page, "#first");
  await e.page
    .getByRole("button", { name: "Translate selection", exact: true })
    .click();
  await expect(e.page.locator(".result")).toContainText("第一");
  await expect(e.page.locator(".thinking")).toHaveCount(0);
});

test("long sidepanel input is split into bounded machine batches and completes", async ({
  extension: e,
}) => {
  await e.configure("click");
  await e.machine();
  const panel = await e.options();
  await panel.goto(panel.url().replace("options.html", "sidepanel.html"));
  const source = "First paragraph for long text translation. ".repeat(220);
  await panel.locator(".source textarea").fill(source);
  await panel.getByRole("button", { name: "Translate", exact: true }).click();
  await expect(panel.locator(".output")).toContainText("第一");
  await expect(panel.locator(".actions")).not.toContainText("Translation complete");
  await expect(panel.locator(".actions")).not.toContainText("→");
  await expect(panel.locator(".translation-error")).toHaveCount(0);
  await expect.poll(() => e.requests.length).toBeGreaterThan(1);
  expect(e.requests.length).toBeGreaterThan(1);
  expect(e.requests.length).toBeLessThan(5);
});

test("language pair controls replace fixed direction and persist across popup and settings", async ({ extension: e }, testInfo) => {
  await e.configure("click");
  await e.machine();
  const options = await e.options();
  await options.getByRole("button", { name: /Languages and behavior/ }).click();
  await options.getByRole("combobox", { name: "Target language", exact: true }).selectOption("Deutsch");
  await options.getByRole("switch", { name: "Bidirectional translation", exact: true }).check();
  await options.getByRole("combobox", { name: "First language", exact: true }).selectOption("English");
  await expect(options.getByRole("combobox", { name: "Second language", exact: true }).locator('option', { hasText: /^English$/ })).toHaveJSProperty("disabled", true);
  await expect(options.getByRole("combobox", { name: "Source language", exact: true })).toHaveCount(0);
  await options.getByText("Custom terms ·", { exact: false }).click();
  await options.getByRole("button", { name: /Add term/ }).click();
  await options.screenshot({ path: testInfo.outputPath("translation-settings.png"), fullPage: true });
  await options.reload();
  await options.getByRole("button", { name: /Languages and behavior/ }).click();
  await expect(options.getByRole("combobox", { name: "First language", exact: true })).toHaveValue("English");
  await options.goto(options.url().replace("options.html", "popup.html"));
  await options.setViewportSize({ width: 330, height: 760 });
  await e.page.bringToFront();
  await options.reload();
  await expect(options.locator(".site-controls")).toBeVisible();
  await expect(options.getByRole("combobox", { name: "First language", exact: true })).toHaveValue("English");
  await expect(options.getByRole("combobox", { name: /Page target language/ })).toHaveCount(0);
  await options.screenshot({ path: testInfo.outputPath("translation-popup.png"), fullPage: true });
  await options.getByRole("switch", { name: "Bidirectional translation", exact: true }).uncheck();
  await expect(options.getByRole("combobox", { name: "First language", exact: true })).toHaveCount(0);
  await expect(options.getByRole("combobox", { name: "Target language", exact: true })).toHaveValue("Deutsch");
});

test("settings errors expire, restart on repetition and clear on navigation", async ({ extension: e }) => {
  await e.configure("click");
  const options = await e.options();
  await options.getByRole("button", { name: /Import and export/ }).click();
  await options.clock.install();
  const invalidFile = { name: "invalid.json", mimeType: "application/json", buffer: Buffer.from("not json") };
  const input = options.locator('input[type="file"]');
  await input.setInputFiles(invalidFile);
  await expect(options.getByRole("alert")).toContainText("Import failed");
  await options.clock.fastForward(3_000);
  await input.setInputFiles(invalidFile);
  await expect(options.getByRole("alert")).toContainText("Import failed");
  await options.clock.fastForward(2_000);
  await expect(options.getByRole("alert")).toBeVisible();
  await options.clock.fastForward(2_000);
  await expect(options.getByRole("alert")).toHaveCount(0);
  await input.setInputFiles(invalidFile);
  await expect(options.getByRole("alert")).toBeVisible();
  await options.getByRole("button", { name: /Languages and behavior/ }).click();
  await expect(options.getByRole("alert")).toHaveCount(0);
  await options.getByRole("button", { name: /Import and export/ }).click();
  await expect(options.getByRole("alert")).toHaveCount(0);
  // An import that finishes after leaving must not resurrect its notice.
  await options.evaluate(() => { File.prototype.text = () => new Promise(resolve => setTimeout(() => resolve("not json"), 1_000)); });
  await options.locator('input[type="file"]').setInputFiles(invalidFile);
  await options.getByRole("button", { name: /Languages and behavior/ }).click();
  await options.getByRole("button", { name: /Import and export/ }).click();
  await options.clock.fastForward(1_500);
  await expect(options.getByRole("alert")).toHaveCount(0);
});

test("automatic page translation respects enablement, blocked sites and SPA navigation", async ({ extension: e }) => {
  await e.configure("click");
  await e.machine();
  await e.settings({ pageTranslationEnabled: false, pageTranslationMode: "auto" });
  await e.page.reload();
  await e.control("start");
  await expect.poll(() => e.pageStatus()).toMatchObject({ state: "idle" });
  expect(e.requests).toHaveLength(0);
  await e.settings({ pageTranslationEnabled: true });
  await expect.poll(async () => (await e.pageStatus()).state).toBe("completed");
  await expect(e.page.locator('[data-flow-translation]').first()).toHaveCSS("border-radius", "9px");
  await expect(e.page.locator('[data-flow-translation]').first()).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const translated = e.requests.length;
  await e.control("restore");
  await e.page.locator('#first').evaluate(el => el.textContent = "First updated paragraph");
  await e.page.waitForTimeout(650);
  expect(e.requests).toHaveLength(translated);
  await e.page.evaluate(() => history.pushState({}, "", "/new-route"));
  await expect.poll(async () => (await e.pageStatus()).state).toBe("completed");
  expect(e.requests.length).toBeGreaterThan(translated);
  await e.settings({ blockedSites: [new URL(e.page.url()).hostname], sensitiveDefaultsApplied: true });
  await expect(e.page.locator('[data-flow-translation]')).toHaveCount(0);
  const blockedCount = e.requests.length;
  await e.page.reload();
  await e.page.waitForTimeout(650);
  expect(e.requests).toHaveLength(blockedCount);
  await e.settings({ blockedSites: [], privacyConsentAccepted: false });
  await e.page.reload();
  await e.page.waitForTimeout(650);
  expect(e.requests).toHaveLength(blockedCount);
});

test("manual mode waits for the shortcut and shares page preferences with popup", async ({ extension: e }, testInfo) => {
  await e.configure("click");
  await e.machine();
  const options = await e.options();
  await options.getByRole("button", { name: /Page mode and appearance/ }).click();
  await expect(options.getByRole("button", { name: "Key translation", exact: true })).toHaveAttribute("aria-pressed", "true");
  await e.page.waitForTimeout(650);
  expect(e.requests).toHaveLength(0);
  // Deliver the same runtime message sent by the command handler (unit-tested separately).
  await options.evaluate(async () => {
    const api = (globalThis as any).chrome;
    const tabs = await api.tabs.query({});
    await api.tabs.sendMessage(tabs.find((tab: any) => tab.url?.startsWith("http://127.0.0.1")).id, { type: "page-shortcut" });
    const command = (await api.commands.getAll()).find((c: any) => c.name === "translate-page");
    if (!command) throw new Error("Missing page shortcut registration");
  });
  await expect.poll(async () => (await e.pageStatus()).state).toBe("completed");
  await e.page.screenshot({ path: testInfo.outputPath("page-translation.png"), fullPage: true });
  await options.getByRole("switch", { name: "Page translation", exact: true }).uncheck();
  await expect(e.page.locator('[data-flow-translation]')).toHaveCount(0);
  await options.goto(options.url().replace("options.html", "popup.html"));
  await options.setViewportSize({ width: 330, height: 800 });
  await e.page.bringToFront();
  await options.reload();
  await expect(options.getByRole("switch", { name: "Page translation", exact: true })).not.toBeChecked();
  await options.getByRole("switch", { name: "Page translation", exact: true }).check();
  await expect(options.getByRole("button", { name: "Key translation", exact: true })).toBeVisible();
  await expect(options.locator('.page-controls')).not.toContainText("chars");
  await options.screenshot({ path: testInfo.outputPath("page-controls.png"), fullPage: true });
});

test("selection, page, long text and connection attempts use the correct model cards", async ({ extension: e }) => {
  await e.configure("click");
  await e.machine();
  const options = await e.options();
  const stored = await options.evaluate(async () => (await (globalThis as any).chrome.storage.local.get("translatorSettings")).translatorSettings);
  const first = stored.modelProfiles[0];
  await e.settings({ modelProfiles: [first, { ...first, id: "secondary", name: "Secondary service" }] });
  await e.page.reload();
  const usage = () => options.evaluate(async () => (globalThis as any).chrome.runtime.sendMessage({ type: "get-model-usage" }));
  await select(e.page, "#first");
  await e.page.getByRole("button", { name: "Translate selection", exact: true }).click();
  await expect(e.page.getByRole("combobox", { name: "Translation service", exact: true })).toHaveCount(0);
  await expect.poll(async () => (await usage()).find((row: any) => row.modelProfileId === first.id)?.serviceCallCount).toBe(1);
  await e.settings({ separateModels: true, featureModels: { selection: "secondary", page: "", longText: "" } });
  await e.page.getByRole("button", { name: "Translate again", exact: true }).click();
  await expect.poll(async () => (await usage()).find((row: any) => row.modelProfileId === "secondary")?.serviceCallCount).toBe(1);
  await e.page.locator("#outside").click();
  await e.control("start");
  await expect.poll(async () => (await e.pageStatus()).state).toBe("completed");
  const pageAndSelectionCalls = e.requests.length - 1;
  await expect.poll(async () => (await usage()).find((row: any) => row.modelProfileId === first.id)?.serviceCallCount).toBe(pageAndSelectionCalls);
  await options.goto(options.url().replace("options.html", "sidepanel.html"));
  await options.locator("textarea").first().fill("Long text for translation.");
  await options.getByRole("button", { name: "Translate", exact: true }).click();
  await expect.poll(async () => (await usage()).find((row: any) => row.modelProfileId === first.id)?.serviceCallCount).toBe(pageAndSelectionCalls + 1);
  await options.evaluate(async () => {
    const api = (globalThis as any).chrome;
    const { translatorSettings } = await api.storage.local.get("translatorSettings");
    await api.runtime.sendMessage({ type: "test-connection", settings: translatorSettings });
  });
  await expect.poll(async () => (await usage()).find((row: any) => row.modelProfileId === first.id)?.serviceCallCount).toBe(pageAndSelectionCalls + 2);
  expect((await usage()).find((row: any) => row.modelProfileId === "secondary")?.serviceCallCount).toBe(1);
});

test("model test results stay in their own cards and expire on timeout or navigation", async ({ extension: e }, testInfo) => {
  await e.configure("click");
  await e.machine();
  const options = await e.options();
  const stored = await options.evaluate(async () => (await (globalThis as any).chrome.storage.local.get("translatorSettings")).translatorSettings);
  const first = { ...stored.modelProfiles[0], name: "Primary service" };
  await e.settings({ modelProfiles: [first, { ...first, id: "invalid-service", name: "Invalid service", apiBaseUrl: "http://public.invalid" }] });
  await options.reload();
  await options.getByRole("button", { name: /API and model management/ }).click();
  await options.clock.install();
  const primary = options.locator(".model").filter({ has: options.locator(".profile-name", { hasText: "Primary service" }) });
  const invalid = options.locator(".model").filter({ has: options.locator(".profile-name", { hasText: "Invalid service" }) });
  await primary.getByRole("button", { name: "Test", exact: true }).click();
  await expect(primary.locator(".model-test-message.success")).toBeVisible();
  await expect(invalid.locator(".model-test-message")).toHaveCount(0);
  await invalid.getByRole("button", { name: "Test", exact: true }).click();
  await expect(invalid.getByRole("alert")).toBeVisible();
  await expect(primary.locator(".model-test-message.success")).toBeVisible();
  await expect(options.locator(".standalone-notice")).toHaveCount(0);
  await options.screenshot({ path: testInfo.outputPath("model-test-results.png"), fullPage: true });
  await options.clock.fastForward(4_000);
  await expect(options.locator(".model-test-message")).toHaveCount(0);
  await invalid.getByRole("button", { name: "Test", exact: true }).click();
  await expect(invalid.getByRole("alert")).toBeVisible();
  await options.getByRole("button", { name: /Languages and behavior/ }).click();
  await options.getByRole("button", { name: /API and model management/ }).click();
  await expect(options.locator(".model-test-message")).toHaveCount(0);
});

test("large page button reflects changed shortcut and closes after starting translation", async ({ extension: e }, testInfo) => {
  await e.configure("click");
  await e.machine();
  const popup = await e.options();
  // Headless Chromium does not assign OS accelerators; emulate the browser's read API only.
  await popup.addInitScript(() => {
    (globalThis as any).chrome.commands.getAll = async () => [{ name: "translate-page", shortcut: "Alt+Q" }];
  });
  await popup.goto(popup.url().replace("options.html", "popup.html"));
  await e.page.bringToFront();
  await popup.reload();
  await expect(popup.getByRole("button", { name: "Click to translate（Alt + Q）", exact: true })).toBeEnabled();
  await popup.evaluate(() => {
    (globalThis as any).chrome.commands.getAll = async () => [{ name: "translate-page", shortcut: "Alt+Shift+W" }];
    window.dispatchEvent(new Event("focus"));
  });
  const start = popup.getByRole("button", { name: "Click to translate（Alt + Shift + W）", exact: true });
  await expect(start).toBeVisible();
  await popup.setViewportSize({ width: 330, height: 760 });
  await popup.screenshot({ path: testInfo.outputPath("page-start-button.png"), fullPage: true });
  await start.click();
  await expect.poll(() => popup.isClosed()).toBe(true);
  await expect.poll(async () => (await e.pageStatus()).state).toBe("completed");
});

test("settings changes cancel page work while further requests are being queued", async ({ extension: e }) => {
  await e.configure("click");
  await e.control("start");
  await expect.poll(() => e.requests.length).toBeGreaterThan(0);
  await e.settings({ featurePreferences: { ...DEFAULT_SETTINGS.featurePreferences, page: { ...DEFAULT_SETTINGS.featurePreferences.page, targetLanguage: "日本語" } } });
  await expect.poll(async () => (await e.pageStatus()).state).toBe("paused");
  await expect.poll(() => e.requests.every(r => r.aborted)).toBe(true);
});

test("LLM page batches show early output, preserve inline markup and cache paragraphs", async ({ extension: e }) => {
  await e.configure("click");
  await e.settings({ enableCache: true });
  await e.control("start");
  await expect.poll(() => e.requests.length).toBe(1);
  expect(e.requests[0]!.batch?.length).toBe(4);
  await expect(e.page.locator('[data-flow-translation][aria-busy="true"]')).toHaveCount(1);
  expect((await e.pageStatus()).done).toBe(0);
  e.finish(0);
  await expect.poll(async () => (await e.pageStatus()).state).toBe("completed");
  await expect(e.page.locator("#second [data-flow-translation] strong")).toHaveText("nested text");
  await expect(e.page.locator('[data-flow-translation][aria-busy="true"]')).toHaveCount(0);
  const count = e.requests.length;
  await e.control("restore");
  await e.control("start");
  await expect.poll(async () => (await e.pageStatus()).state).toBe("completed");
  expect(e.requests.length).toBe(count);
});

for (const limit of [1, 6]) test(`saved concurrency ${limit} controls actual page requests and streams before completion`, async ({ extension: e }) => {
  await e.configure("click");
  const options = await e.options();
  await options.getByRole("button", { name: /Models/ }).click();
  await options.locator(".model .profile-name").first().click();
  await options.getByText("Advanced settings", { exact: true }).click();
  await options.getByRole("spinbutton", { name: "Maximum concurrent requests", exact: false }).fill(String(limit));
  if (limit === 6) await options.getByRole("dialog").screenshot({ path: ".output/ui-review/performance-settings.png" });
  await options.getByRole("button", { name: "Save model", exact: true }).click();
  // Saving is asynchronous; starting early can race the settings-change pause.
  await expect(options.getByRole("dialog")).toBeHidden();
  await e.page.evaluate(() => {
    document.querySelectorAll("p, #outside, input, textarea").forEach(node => node.remove());
    for (let i = 0; i < 12; i++) {
      const p = document.createElement("p"); p.id = `long-${i}`;
      p.textContent = `Paragraph ${i}. ` + "English text for translation testing. ".repeat(30);
      document.body.append(p);
    }
  });
  await e.control("start");
  await expect.poll(() => e.requests.length).toBe(limit);
  await e.page.waitForTimeout(400);
  expect(e.requests.length).toBe(limit);
  await expect(e.page.locator('[data-flow-translation][aria-busy="true"]')).toHaveCount(limit);
  expect((await e.pageStatus()).done).toBe(0);
  await e.control("pause");
  await expect.poll(() => e.requests.every(request => request.aborted)).toBe(true);
  await expect(e.page.locator("[data-flow-translation]")).toHaveCount(0);
});

test("page starts with visible paragraphs after scrolling", async ({ extension: e }) => {
  await e.configure("click");
  await e.page.evaluate(() => {
    document.querySelectorAll("p, #outside, input, textarea").forEach(node => node.remove());
    for (let i = 0; i < 20; i++) {
      const p = document.createElement("p"); p.id = `section-${i}`; p.style.minHeight = "800px";
      p.textContent = `Visible marker ${i}. ` + "English translation example. ".repeat(35);
      document.body.append(p);
    }
    document.querySelector("#section-10")!.scrollIntoView();
  });
  await e.control("start");
  await expect.poll(() => e.requests.length).toBe(2);
  expect(e.requests[0]!.source).toContain("Visible marker 10.");
  expect(e.requests[0]!.source).not.toContain("Visible marker 0.");
  await e.control("pause");
});

test("malformed batch output clears provisional translations and falls back without shifting paragraphs", async ({ extension: e }) => {
  await e.configure("click");
  await e.control("start");
  await expect.poll(() => e.requests.length).toBe(1);
  await expect(e.page.locator('[data-flow-translation][aria-busy="true"]')).toHaveCount(1);
  // The mock already emitted id 0; a duplicate must invalidate the batch.
  e.requests[0]!.response.end(`data: ${JSON.stringify({ choices: [{ delta: { content: '{"id":"0","text":"WRONG PARAGRAPH"}\n' } }] })}\n\ndata: [DONE]\n\n`);
  await expect.poll(() => e.requests.length).toBe(3);
  expect(e.requests.slice(1).every(request => !request.batch)).toBe(true);
  e.finish(1); e.finish(2);
  await expect.poll(() => e.requests.length).toBe(5);
  e.finish(3); e.finish(4);
  await expect.poll(async () => (await e.pageStatus()).state).toBe("completed");
  await expect(e.page.locator("[data-flow-translation]")).toHaveCount(4);
  // Assert translation text independently of the new local action controls.
  const translatedText = (selector: string) => e.page.locator(selector).evaluate(host => {
    const copy = document.createElement("div");
    host.shadowRoot!.childNodes.forEach(node => copy.append(node.cloneNode(true)));
    copy.querySelectorAll("style").forEach(node => node.remove());
    return copy.textContent;
  });
  await expect.poll(() => translatedText("#first [data-flow-translation]")).toBe("译文完成");
  await expect.poll(() => translatedText("#second [data-flow-translation]")).toBe("译文完成");
});
