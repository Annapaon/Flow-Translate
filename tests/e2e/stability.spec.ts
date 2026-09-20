import { test, expect } from "./fixtures";

test("two settings pages preserve independent edits and feature bindings", async ({ extension: e }) => {
  await e.configure("click");
  const first = await e.options();
  await first.evaluate(async () => {
    const api = (globalThis as any).chrome;
    const { translatorSettings: s } = await api.storage.local.get("translatorSettings");
    await api.storage.local.set({ translatorSettings: { ...s, separateModels: true, modelProfiles: [s.modelProfiles[0], { ...s.modelProfiles[0], id: "other", name: "Other", model: "other" }] } });
  });
  await first.reload();
  const second = await e.options();
  await first.getByRole("button", { name: /Languages and behavior/ }).click();
  await second.getByRole("button", { name: /Page mode and appearance/ }).click();
  await Promise.all([
    first.getByRole("combobox", { name: "Translation service", exact: true }).selectOption("other"),
    second.getByRole("combobox", { name: "Translation service", exact: true }).selectOption("other")
  ]);
  await expect.poll(() => first.evaluate(async () => (await (globalThis as any).chrome.storage.local.get("translatorSettings")).translatorSettings.featureModels)).toEqual({ selection: "other", page: "other", longText: "" });
  await second.getByRole("button", { name: /Prompts by scene/ }).click();
  await Promise.all([
    first.getByRole("combobox", { name: "Output mode", exact: true }).selectOption("grammar"),
    second.getByRole("textbox", { name: /Base system prompt/ }).fill("Saved from another page")
  ]);
  await expect.poll(() => first.evaluate(async () => {
    const s = (await (globalThis as any).chrome.storage.local.get("translatorSettings")).translatorSettings;
    return [s.outputMode, s.systemPrompt, s.featureModels.page];
  })).toEqual(["grammar", "Saved from another page", "other"]);
});

test("region rejection explains access failures and recovers after settings change", async ({ extension: e }) => {
  await e.configure("click");
  await e.settings({ privacyConsentAccepted: false });
  await expect.poll(async () => (await e.control("region")).unavailableReason).toBe("consent");
  expect((await e.control("region")).error).toContain("Accept");
  await e.settings({ privacyConsentAccepted: true, pageTranslationEnabled: false });
  await expect.poll(async () => (await e.control("region")).unavailableReason).toBe("disabled");
  await e.settings({ pageTranslationEnabled: true });
  await expect.poll(async () => (await e.pageStatus()).unavailableReason).toBeUndefined();
  expect((await e.control("region")).state).toBe("selecting");
  await e.page.keyboard.press("Escape");
});

test("idle popup uses fewer polls and refreshes after returning to the page", async ({ extension: e }) => {
  await e.configure("click");
  const popup = await e.options();
  const pageId = await popup.evaluate(async () => (await (globalThis as any).chrome.tabs.query({})).find((tab: any) => tab.url?.startsWith("http://127.0.0.1")).id);
  await popup.addInitScript(({ pageId }) => {
    const api = (globalThis as any).chrome;
    const original = api.tabs.sendMessage.bind(api.tabs);
    (globalThis as any).statusCalls = 0;
    api.tabs.query = async () => [{ id: pageId, url: "http://127.0.0.1/" }];
    api.tabs.sendMessage = (...args: any[]) => {
      if (args[1]?.type === "page-status") (globalThis as any).statusCalls++;
      return original(...args);
    };
  }, { pageId });
  await popup.goto(popup.url().replace("options.html", "popup.html"));
  await expect.poll(() => popup.evaluate(() => (globalThis as any).statusCalls)).toBeGreaterThan(0);
  await popup.waitForTimeout(2200);
  expect(await popup.evaluate(() => (globalThis as any).statusCalls)).toBeLessThanOrEqual(2);
  await popup.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => popup.evaluate(() => (globalThis as any).statusCalls)).toBeGreaterThan(1);
});
