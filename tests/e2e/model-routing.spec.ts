import { test, expect, select } from "./fixtures";

test("feature assignments persist, route requests and keep active page sessions on their original model", async ({ extension: e }) => {
  await e.configure("click");
  const options = await e.options();
  await options.evaluate(async () => {
    const api = (globalThis as any).chrome;
    const { translatorSettings: settings } = await api.storage.local.get("translatorSettings");
    const original = settings.modelProfiles[0];
    await api.storage.local.set({ translatorSettings: { ...settings, modelProfiles: [original,
      ...["selection-model", "page-model", "long-model"].map(id => ({ ...original, id, name: id, model: id }))] } });
  });
  await options.reload();
  await options.getByRole("button", { name: /Languages and behavior/ }).click();
  await options.getByRole("combobox", { name: "Selection translation service", exact: true }).selectOption("selection-model");
  await options.getByRole("button", { name: /Page mode and appearance/ }).click();
  await options.getByRole("combobox", { name: "Page translation service", exact: true }).selectOption("page-model");
  await options.getByRole("button", { name: /Side panel settings/ }).click();
  await options.getByRole("combobox", { name: "Long text translation service", exact: true }).selectOption("long-model");
  await expect.poll(() => options.evaluate(async () => ((await (globalThis as any).chrome.storage.local.get("translatorSettings")).translatorSettings.featureModels.longText))).toBe("long-model");
  await options.locator(".feature-binding").screenshot({ path: ".output/ui-review/model-routing.png" });
  await options.getByRole("button", { name: /Page mode and appearance/ }).click();
  await expect(options.getByRole("combobox", { name: "Page translation service", exact: true })).toHaveValue("page-model");
  await options.reload();
  await options.getByRole("button", { name: /Side panel settings/ }).click();
  await expect(options.getByRole("combobox", { name: "Long text translation service", exact: true })).toHaveValue("long-model");

  await select(e.page, "#first");
  await e.page.getByRole("button", { name: "Translate selection", exact: true }).click();
  await expect.poll(() => e.requests.length).toBe(1);
  expect(e.requests[0]!.model).toBe("selection-model");
  e.finish(0);
  await expect(e.page.locator(".result")).toContainText("完成");
  await expect(e.page.locator(".foot")).toContainText("selection-model · selection-model");
  await expect(e.page.locator(".card select")).toHaveCount(0);
  await e.page.locator("#outside").click();

  await e.control("start");
  await expect.poll(() => e.requests.length).toBe(2);
  expect(e.requests[1]!.model).toBe("page-model");
  await options.getByRole("button", { name: /Page mode and appearance/ }).click();
  await options.getByRole("combobox", { name: "Page translation service", exact: true }).selectOption("long-model");
  await expect.poll(() => options.evaluate(async () => ((await (globalThis as any).chrome.storage.local.get("translatorSettings")).translatorSettings.featureModels.page))).toBe("long-model");
  await e.page.waitForTimeout(200);
  expect((await e.pageStatus()).state).toBe("running");
  expect(e.requests[1]!.aborted).toBe(false);
  e.finish(1);
  await expect.poll(async () => (await e.pageStatus()).state).toBe("completed");
  await e.control("restore");
  await e.control("start");
  await expect.poll(() => e.requests.length).toBe(3);
  expect(e.requests[2]!.model).toBe("long-model");
  e.finish(2);
  await expect.poll(async () => (await e.pageStatus()).state).toBe("completed");

  const panel = await e.options();
  await panel.goto(panel.url().replace("options.html", "sidepanel.html"));
  await expect(panel.getByRole("combobox", { name: "Model", exact: true })).toHaveValue("long-model");
  await expect(panel.getByRole("combobox", { name: "Model", exact: true })).toBeEnabled();
  await panel.locator(".source textarea").fill("Long text translation example.");
  await panel.getByRole("button", { name: "Translate", exact: true }).click();
  await expect.poll(() => e.requests.length).toBe(4);
  expect(e.requests[3]!.model).toBe("long-model");
  e.finish(3);
  await expect(panel.locator(".output")).toContainText("完成");
  await options.reload();
  await options.getByRole("button", { name: /Models/ }).click();
  const card = (name: string) => options.locator(".model").filter({ has: options.locator(".profile-name", { hasText: name }) });
  await expect(card("selection-model").locator(".usage-stats")).toContainText("1API attempts");
  await expect(card("page-model").locator(".usage-stats")).toContainText("1API attempts");
  await expect(card("long-model").locator(".usage-stats")).toContainText("2API attempts");
  await card("long-model").locator(".switch").click();
  await options.getByRole("button", { name: /Page mode and appearance/ }).click();
  await expect(options.getByRole("combobox", { name: "Page translation service", exact: true })).toHaveValue("");
  await options.getByRole("button", { name: /Side panel settings/ }).click();
  await expect(options.getByRole("combobox", { name: "Long text translation service", exact: true })).toHaveValue("");
  await options.getByRole("button", { name: /Languages and behavior/ }).click();
  await options.getByRole("combobox", { name: "Selection translation service", exact: true }).selectOption("");
  await select(e.page, "#second");
  await e.page.getByRole("button", { name: "Translate selection", exact: true }).click();
  await expect.poll(() => e.requests.length).toBe(5);
  expect(e.requests[4]!.model).toBe("test-model");
  e.finish(4);
});

test("model cards set and persist the default without changing feature assignments", async ({ extension: e }) => {
  await e.configure("click");
  const options = await e.options();
  await options.evaluate(async () => {
    const api = (globalThis as any).chrome;
    const { translatorSettings: settings } = await api.storage.local.get("translatorSettings");
    const first = settings.modelProfiles[0];
    await api.storage.local.set({ translatorSettings: { ...settings, separateModels: true,
      featureModels: { selection: "", page: first.id, longText: "" },
      modelProfiles: [first, { ...first, id: "new-default", name: "New default", model: "new-default-model" }, { ...first, id: "disabled", name: "Disabled model", enabled: false }] } });
  });
  await options.reload();
  await options.getByRole("button", { name: /Models/ }).click();
  const next = options.locator(".model").filter({ has: options.locator(".profile-name", { hasText: "New default" }) });
  const disabled = options.locator(".model").filter({ has: options.locator(".profile-name", { hasText: "Disabled model" }) });
  await expect(disabled.getByRole("button", { name: "Set as default" })).toBeDisabled();
  await next.getByRole("button", { name: "Set as default" }).click();
  await expect(next.getByRole("button", { name: "Current default" })).toBeDisabled();
  await expect(next.locator(".default-badge")).toHaveText("Default");
  await expect(options.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => options.evaluate(async () => (await (globalThis as any).chrome.storage.local.get("translatorSettings")).translatorSettings.activeModelId)).toBe("new-default");
  await next.screenshot({ path: ".output/ui-review/default-model-card.png" });
  await options.getByRole("button", { name: /Page mode and appearance/ }).click();
  await expect(options.getByRole("combobox", { name: "Page translation service", exact: true })).toHaveValue("default-model");
  await options.reload();
  await options.getByRole("button", { name: /Models/ }).click();
  await expect(next.locator(".default-badge")).toHaveText("Default");
  await select(e.page, "#first");
  await e.page.getByRole("button", { name: "Translate selection", exact: true }).click();
  await expect.poll(() => e.requests.length).toBe(1);
  expect(e.requests[0]!.model).toBe("new-default-model");
  e.finish(0);
});

test("popup selection service updates only selection routing and omits page service configuration", async ({ extension: e }) => {
  await e.configure("click");
  const popup = await e.options();
  await popup.evaluate(async () => {
    const api = (globalThis as any).chrome;
    const { translatorSettings: s } = await api.storage.local.get("translatorSettings");
    const base = s.modelProfiles[0];
    await api.storage.local.set({ translatorSettings: { ...s, separateModels: true, featureModels: { selection: "old", page: "old", longText: "old" }, modelProfiles: [base, ...["old", "chosen"].map(id => ({ ...base, id, name: id, model: id }))] } });
  });
  await popup.goto(popup.url().replace("options.html", "popup.html"));
  await popup.setViewportSize({ width: 350, height: 600 });
  const consent = popup.getByRole("button", { name: "Understand and agree", exact: true });
  if (await consent.isVisible()) await consent.click();
  const choice = popup.getByRole("combobox", { name: "Selection translation service", exact: true });
  await expect(choice).toHaveValue("old");
  await expect(popup.getByRole("combobox", { name: "Page translation service", exact: true })).toHaveCount(0);
  await expect(popup.getByRole("combobox", { name: "Scene", exact: true })).toHaveCount(0);
  expect(await popup.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(600);
  await choice.selectOption("chosen");
  await expect(choice).toBeEnabled();
  const stored = () => popup.evaluate(async () => (await (globalThis as any).chrome.storage.local.get("translatorSettings")).translatorSettings);
  await expect.poll(async () => (await stored()).featureModels).toEqual({ selection: "chosen", page: "old", longText: "old" });
  await select(e.page, "#first");
  await e.page.getByRole("button", { name: "Translate selection", exact: true }).click();
  await expect.poll(() => e.requests.length).toBe(1);
  expect(e.requests[0]!.model).toBe("chosen");
  e.finish(0);
  await expect(e.page.locator(".result")).toContainText("完成");
  await e.page.locator("#outside").click();
  await e.control("start");
  await expect.poll(() => e.requests.length).toBe(2);
  expect(e.requests[1]!.model).toBe("old");
  e.finish(1);
  await expect.poll(async () => (await e.pageStatus()).state).toBe("completed");
  await popup.reload();
  await expect(choice).toHaveValue("chosen");
  expect((await stored()).featureModels).toEqual({ selection: "chosen", page: "old", longText: "old" });
});
