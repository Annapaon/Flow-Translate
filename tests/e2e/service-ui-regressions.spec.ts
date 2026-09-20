import { test, expect } from "./fixtures";

test("prompts remain editable with every machine service selected", async ({
  extension: e
}) => {
  await e.configure("click");
  const options = await e.options();
  for (const provider of ["baidu", "google", "microsoft"] as const) {
    await e.machine(provider);
    await options.reload();
    const menu = options.getByRole("button", { name: /Prompts by scene/ });
    await expect(menu).toBeEnabled();
    await menu.click();
    await expect(
      options.getByRole("heading", { name: "Prompt settings", exact: true })
    ).toBeVisible();
    const prompt = options.getByRole("textbox", {
      name: /Base system prompt/
    });
    const value = `Saved prompt for ${provider}`;
    await prompt.fill(value);
    await expect
      .poll(() =>
        options.evaluate(
          async () =>
            (
              await (globalThis as any).chrome.storage.local.get(
                "translatorSettings"
              )
            ).translatorSettings.systemPrompt
        )
      )
      .toBe(value);
    await options.reload();
    await menu.click();
    await expect(prompt).toHaveValue(value);
  }
});

test("popup machine services show only profile names and Bing replaces the old built-in name", async ({
  extension: e
}) => {
  await e.configure("click");
  const options = await e.options();
  await options.evaluate(async () => {
    const api = (globalThis as any).chrome;
    const { translatorSettings: s } =
      await api.storage.local.get("translatorSettings");
    const original = s.modelProfiles[0];
    const profiles = [
      {
        ...original,
        id: "baidu",
        name: "百度通用翻译",
        provider: "baidu",
        model: "",
        appId: "test-app"
      },
      {
        ...original,
        id: "google",
        name: "谷歌翻译",
        provider: "google",
        model: "stale-llm-name"
      },
      {
        ...original,
        id: "bing",
        name: "Microsoft / 必应翻译",
        provider: "microsoft",
        model: ""
      },
      { ...original, id: "llm", name: "LLM", model: "test-model" }
    ];
    await api.storage.local.set({
      translatorSettings: {
        ...s,
        uiLanguage: "zh-CN",
        activeModelId: "baidu",
        modelProfiles: profiles
      }
    });
  });
  const popup = await e.options();
  await popup.goto(popup.url().replace("options.html", "popup.html"));
  const service = popup.getByRole("combobox", {
    name: "翻译服务",
    exact: true
  });
  for (const [id, label] of [
    ["baidu", "百度通用翻译"],
    ["google", "谷歌翻译"],
    ["bing", "必应翻译"],
    ["llm", "LLM · test-model"]
  ]) {
    await expect(service.locator(`option[value="${id}"]`)).toHaveText(label!);
    await service.selectOption(id!);
    await expect(service).toHaveValue(id!);
  }
  await options.reload();
  await options.getByRole("button", { name: /模型服务/ }).click();
  const bing = options
    .locator(".model")
    .filter({ has: options.locator(".profile-name", { hasText: "必应翻译" }) });
  await expect(bing.locator(".profile-model")).toHaveText("必应翻译");
  await options.getByRole("button", { name: /添加服务/ }).click();
  await expect(
    options
      .getByRole("combobox", { name: "服务类型", exact: true })
      .locator('option[value="microsoft"]')
  ).toHaveText("必应翻译");
});

test("sidepanel changes the default or only its feature binding and sends requests to the selected model", async ({
  extension: e
}) => {
  await e.configure("click");
  const options = await e.options();
  await options.evaluate(async () => {
    const api = (globalThis as any).chrome;
    const { translatorSettings: s } =
      await api.storage.local.get("translatorSettings");
    const original = s.modelProfiles[0];
    const profiles = [
      original,
      ...["second", "third"].map((id) => ({
        ...original,
        id,
        name: id,
        model: id
      }))
    ];
    await api.storage.local.set({
      translatorSettings: { ...s, modelProfiles: profiles }
    });
  });
  const panel = await e.options();
  await panel.goto(panel.url().replace("options.html", "sidepanel.html"));
  const model = panel.getByRole("combobox", { name: "Model", exact: true });
  const read = () =>
    panel.evaluate(
      async () =>
        (
          await (globalThis as any).chrome.storage.local.get(
            "translatorSettings"
          )
        ).translatorSettings
    );
  await model.selectOption("second");
  await expect(model).toBeEnabled();
  await expect.poll(async () => (await read()).activeModelId).toBe("second");
  await panel
    .locator(".source textarea")
    .fill("Use the selected model for this long text.");
  await panel.getByRole("button", { name: "Translate", exact: true }).click();
  await expect.poll(() => e.requests.length).toBe(1);
  expect(e.requests[0]!.model).toBe("second");
  await expect(model).toBeDisabled();
  e.finish(0);
  await expect(model).toBeEnabled();

  await e.settings({
    separateModels: true,
    featureModels: { selection: "third", page: "second", longText: "second" }
  });
  await model.selectOption("third");
  await expect(model).toBeEnabled();
  await expect
    .poll(async () => (await read()).featureModels.longText)
    .toBe("third");
  expect((await read()).activeModelId).toBe("second");
  expect((await read()).featureModels).toEqual({
    selection: "third",
    page: "second",
    longText: "third"
  });
  await panel.getByRole("button", { name: "Translate", exact: true }).click();
  await expect.poll(() => e.requests.length).toBe(2);
  expect(e.requests[1]!.model).toBe("third");
  e.finish(1);
  await expect(model).toBeEnabled();
  await panel.reload();
  await expect(model).toHaveValue("third");
  await panel
    .locator(".source textarea")
    .fill("Use the selected model for this long text.");
  await model.selectOption("");
  await expect(model).toBeEnabled();
  await expect.poll(async () => (await read()).featureModels.longText).toBe("");
  await panel.getByRole("button", { name: "Translate", exact: true }).click();
  await expect.poll(() => e.requests.length).toBe(3);
  expect(e.requests[2]!.model).toBe("second");
  e.finish(2);
});


test("data handling notice hides after consent and stays hidden after reopening settings", async ({ extension: e }) => {
  await e.configure("click");
  await e.settings({ privacyConsentAccepted: false });
  const options = await e.options();
  const notice = options.locator(".privacy-disclosure");
  await expect(notice).toBeVisible();
  await expect(notice.getByRole("checkbox")).toHaveCount(0);
  await expect.poll(() => options.evaluate(async () => (
    await (globalThis as any).chrome.storage.local.get("translatorSettings")
  ).translatorSettings.privacyConsentAccepted)).toBe(false);
  await notice.getByRole("button", { name: "Understand and agree", exact: true }).click();
  await expect(notice).toBeHidden();
  await expect.poll(() => options.evaluate(async () => (
    await (globalThis as any).chrome.storage.local.get("translatorSettings")
  ).translatorSettings.privacyConsentAccepted)).toBe(true);
  await options.reload();
  await expect(options.getByRole("heading", { name: "General settings", exact: true })).toBeVisible();
  await expect(notice).toBeHidden();
  await expect(options.locator(".privacy-details")).toHaveCount(0);
  await options.evaluate(async () => { await (globalThis as any).chrome.storage.local.set({ optionsPrivacyNoticeAccepted: false }); });
  await options.reload();
  await expect(notice).toBeVisible();
});


test("machine defaults do not lock saved LLM preferences and export controls stay grouped", async ({ extension: e }) => {
  await e.configure("click");
  const options = await e.options();
  for (const provider of ["baidu", "google", "microsoft"] as const) {
    await e.machine(provider);
    await options.evaluate(async () => {
      const api = (globalThis as any).chrome;
      const { translatorSettings: s } = await api.storage.local.get("translatorSettings");
      await api.storage.local.set({ translatorSettings: { ...s, featurePreferences: { ...s.featurePreferences, selection: { ...s.featurePreferences.selection, smartOutput: true, outputMode: "grammar", translationScene: "academic" } } } });
    });
    await e.settings({ pageTranslationEnabled: true, pageTranslationMode: "manual" });
    await options.reload();
    await options.getByRole("button", { name: /Languages and behavior/ }).click();
    await expect(options.getByRole("switch", { name: "Smart output", exact: true })).toBeHidden();
    await expect.poll(() => options.evaluate(async () => {
      const { translatorSettings: s } = await (globalThis as any).chrome.storage.local.get("translatorSettings");
      return [s.featurePreferences.selection.smartOutput, s.featurePreferences.selection.outputMode, s.featurePreferences.selection.translationScene];
    })).toEqual([true, "grammar", "academic"]);
    await options.getByRole("button", { name: /Page mode and appearance/ }).click();
    await expect(options.getByRole("button", { name: "Change shortcut", exact: true })).toBeVisible();
    await options.reload();
    await options.getByRole("button", { name: /Languages and behavior/ }).click();
    await expect(options.getByRole("switch", { name: "Smart output", exact: true })).toBeHidden();
    await expect.poll(() => options.evaluate(async () => {
      const { translatorSettings: s } = await (globalThis as any).chrome.storage.local.get("translatorSettings");
      return [s.featurePreferences.selection.smartOutput, s.featurePreferences.selection.outputMode];
    })).toEqual([true, "grammar"]);
    const popup = await e.options();
    await popup.goto(popup.url().replace("options.html", "popup.html"));
    await expect(popup.getByRole("combobox", { name: "Scene", exact: true })).toHaveCount(0);
    await expect(popup.getByRole("button", { name: "Change shortcut", exact: true })).toHaveCount(0);
    await expect(popup.getByRole("button", { name: /Click to translate/ })).toBeVisible();
    await popup.reload();
    await expect(popup.getByRole("combobox", { name: "Scene", exact: true })).toHaveCount(0);
    await popup.goto(popup.url().replace("popup.html", "sidepanel.html"));
    await expect(popup.getByRole("combobox", { name: "Scene", exact: true })).toHaveCount(0);
    await popup.close();
  }
  await options.getByRole("button", { name: /Import and export/ }).click();
  const card = options.locator(".data-actions article").filter({ hasText: "Export safe configuration" });
  await expect(card.getByRole("switch", { name: "Include website rules in export" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Export without secrets" })).toBeVisible();
});

test("capability visibility follows feature bindings and preserves hidden preferences", async ({ extension: e }) => {
  await e.configure("click");
  const options = await e.options();
  await options.evaluate(async () => {
    const api = (globalThis as any).chrome;
    const { translatorSettings: s } = await api.storage.local.get("translatorSettings");
    const llm = { ...s.modelProfiles[0], id: "llm", name: "LLM" };
    const machine = { ...llm, id: "machine", name: "Machine", provider: "baidu", model: "", appId: "app" };
    const featurePreferences = Object.fromEntries(Object.entries(s.featurePreferences).map(([feature, value]: any) => [feature, { ...value, smartOutput: true, outputMode: "grammar", translationScene: "academic" }]));
    await api.storage.local.set({ translatorSettings: { ...s, modelProfiles: [llm, machine], activeModelId: "machine", separateModels: true, featureModels: { selection: "llm", longText: "machine", page: "machine" }, smartOutput: true, outputMode: "grammar", translationScene: "academic", featurePreferences } });
  });
  await options.reload();
  await options.getByRole("button", { name: /Languages and behavior/ }).click();
  await expect(options.getByRole("combobox", { name: "Output mode", exact: true })).toHaveValue("grammar");
  await expect(options.locator(".feature-group .standalone-notice")).toHaveCount(0);
  const popup = await e.options();
  await popup.goto(popup.url().replace("options.html", "popup.html"));
  await expect(popup.getByRole("combobox", { name: "Scene", exact: true })).toHaveValue("academic");
  const side = await e.options();
  await side.goto(side.url().replace("options.html", "sidepanel.html"));
  await expect(side.getByRole("combobox", { name: "Scene", exact: true })).toHaveCount(0);
  await side.getByRole("combobox", { name: "Model", exact: true }).selectOption("llm");
  await expect(side.getByRole("combobox", { name: "Scene", exact: true })).toHaveValue("academic");
  await e.settings({ activeModelId: "llm", featureModels: { selection: "machine", longText: "machine", page: "llm" } });
  await popup.reload();
  await expect(popup.getByRole("combobox", { name: "Scene", exact: true })).toHaveCount(0);
  await options.reload();
  await options.getByRole("button", { name: /Languages and behavior/ }).click();
  await expect(options.locator(".feature-group .standalone-notice")).toHaveCount(1);
  await expect(options.getByRole("combobox", { name: "Output mode", exact: true })).toHaveCount(0);
  await expect(options.getByRole("switch", { name: "Smart output", exact: true })).toHaveCount(0);
  await expect(options.getByRole("combobox", { name: "Reasoning", exact: true })).toHaveCount(0);
  await e.settings({ featureModels: { selection: "", longText: "machine", page: "machine" } });
  await popup.reload();
  await expect(popup.getByRole("combobox", { name: "Scene", exact: true })).toHaveValue("academic");
  await options.reload();
  await options.getByRole("button", { name: /Languages and behavior/ }).click();
  await expect(options.getByRole("switch", { name: "Smart output", exact: true })).toBeChecked();
  await expect(options.getByRole("combobox", { name: "Output mode", exact: true })).toHaveValue("grammar");
});


for (const first of ["popup", "options"] as const) {
  test(`privacy notices confirm independently with ${first} first and reset together`, async ({ extension: e }) => {
    await e.configure("click");
    await e.settings({ privacyConsentAccepted: false });
    const options = await e.options();
    const popup = await e.options();
    await popup.goto(popup.url().replace("options.html", "popup.html"));
    const settingsNotice = options.locator(".privacy-disclosure");
    const popupNotice = popup.locator(".consent");
    await expect(settingsNotice).toBeVisible();
    await expect(popupNotice).toBeVisible();
    const firstNotice = first === "popup" ? popupNotice : settingsNotice;
    const secondNotice = first === "popup" ? settingsNotice : popupNotice;
    await firstNotice.getByRole("button", { name: "Understand and agree", exact: true }).click();
    await expect(firstNotice).toHaveCount(0);
    await expect(secondNotice).toBeVisible();
    await options.reload(); await popup.reload();
    await expect(firstNotice).toHaveCount(0);
    await expect(secondNotice).toBeVisible();
    await secondNotice.getByRole("button", { name: "Understand and agree", exact: true }).click();
    await expect(secondNotice).toHaveCount(0);
    await options.reload(); await popup.reload();
    await expect(settingsNotice).toHaveCount(0);
    await expect(popupNotice).toHaveCount(0);
    await options.getByRole("button", { name: /Import and export/ }).click();
    options.once("dialog", dialog => dialog.accept());
    await options.getByRole("button", { name: "Delete and reset", exact: true }).click();
    await expect.poll(() => options.evaluate(async () => {
      const s = await (globalThis as any).chrome.storage.local.get(["popupPrivacyNoticeAccepted", "optionsPrivacyNoticeAccepted", "translatorSettings"]);
      return [s.popupPrivacyNoticeAccepted, s.optionsPrivacyNoticeAccepted, s.translatorSettings.privacyConsentAccepted];
    })).toEqual([false, false, false]);
    await options.reload(); await popup.reload();
    await expect(settingsNotice).toBeVisible();
    await expect(popupNotice).toBeVisible();
  });
}
