import { test, expect } from "./fixtures";

test("machine service cards omit model metadata and DeepL is not offered", async ({ extension: e }) => {
  await e.configure("click");
  const options = await e.options();
  await options.evaluate(async () => {
    const api = (globalThis as any).chrome;
    const { translatorSettings: settings } = await api.storage.local.get("translatorSettings");
    const original = settings.modelProfiles[0];
    await api.storage.local.set({ translatorSettings: { ...settings, uiLanguage: "zh-CN", modelProfiles: [
      ...["baidu", "google", "microsoft"].map(provider => ({ ...original, id: provider, name: provider, provider, model: "", appId: "test-app-id" })),
      { ...original, id: "llm", name: "LLM", model: "" }
    ] } });
  });
  await options.reload();
  await options.getByRole("button", { name: /模型服务/ }).click();
  for (const [id, label] of [["baidu", "百度翻译"], ["google", "Google 翻译"], ["microsoft", "必应翻译"]]) {
    const card = options.locator(".model").filter({ has: options.locator(".profile-name", { hasText: id }) });
    await expect(card.locator(".profile-model")).toHaveText(label!);
    await card.click();
    await expect(options.getByRole("textbox", { name: "模型名称", exact: true })).toHaveCount(0);
    await options.getByRole("button", { name: "取消", exact: true }).click();
  }
  await expect(options.locator(".model").filter({ has: options.locator(".profile-name", { hasText: "LLM" }) }).locator(".profile-model")).toContainText("未配置模型");
  await options.getByRole("button", { name: /添加服务/ }).click();
  const providers = options.getByRole("combobox", { name: "服务类型", exact: true });
  await expect(providers.locator('option[value="deepl"]')).toHaveCount(0);
});
