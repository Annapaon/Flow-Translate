import { test, expect, select } from "./fixtures";
import type { Page } from "@playwright/test";
async function fileFor(options: Page) {
  const settings = await options.evaluate(async () => (await (globalThis as any).chrome.storage.local.get("translatorSettings")).translatorSettings);
  return { settings, file: () => ({ name: "imported.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(settings)) }) };
}

test("import and enable preserves local consent and immediately uses imported models", async ({ extension: e }) => {
  await e.configure("click");
  const options = await e.options();
  const { settings, file } = await fileFor(options);
  settings.privacyConsentAccepted = false;
  settings.modelProfiles[0].model = "imported-model";
  let confirms = 0;
  options.on("dialog", async dialog => { confirms++; await dialog.dismiss(); });
  await options.getByRole("button", { name: /Import and export/ }).click();
  await options.locator('input[type="file"]').setInputFiles(file());
  await expect(options.getByRole("button", { name: "Import and enable", exact: true })).toBeEnabled();
  expect((await fileFor(options)).settings.modelProfiles[0].model).toBe("test-model");
  await options.locator(".import-preview").screenshot({ path: ".output/ui-review/import-enable.png" });
  await options.getByRole("button", { name: "Import and enable", exact: true }).click();
  await expect(options.getByRole("status")).toContainText("Configuration imported and enabled");
  expect((await fileFor(options)).settings.privacyConsentAccepted).toBe(true);
  expect(confirms).toBe(0);
  await select(e.page, "#first");
  await e.page.getByRole("button", { name: "Translate selection", exact: true }).click();
  await expect.poll(() => e.requests.length).toBe(1);
  expect(e.requests[0]!.model).toBe("imported-model");
  e.finish(0);
  await expect(e.page.locator(".result")).toContainText("完成");
});

test("import requests enabled endpoints together, preserves settings on denial and retries on a fresh click", async ({ extension: e }) => {
  await e.configure("click");
  const options = await e.options();
  const { settings, file } = await fileFor(options);
  const profile = settings.modelProfiles[0];
  settings.modelProfiles = [
    { ...profile, apiBaseUrl: "https://api.example.com/v1", name: "Imported" },
    { ...profile, id: "second", apiBaseUrl: "https://api.example.com/v2" },
    { ...profile, id: "third", apiBaseUrl: "https://other.example.com/v1" },
    { ...profile, id: "disabled", enabled: false, apiBaseUrl: "https://disabled.example.com/v1" },
  ];
  await options.evaluate(() => {
    const win = window as any; win.permissionCalls = []; win.grant = false;
    (globalThis as any).chrome.permissions.request = async (request: unknown) => {
      win.permissionCalls.push({ request, active: navigator.userActivation.isActive });
      return win.grant;
    };
    window.confirm = () => { throw new Error("Unexpected application confirmation"); };
  });
  await options.getByRole("button", { name: /Import and export/ }).click();
  await options.locator('input[type="file"]').setInputFiles(file());
  const button = options.getByRole("button", { name: "Import and enable", exact: true });
  await button.click();
  await expect(options.getByRole("alert")).toContainText("Configuration was not imported");
  expect((await fileFor(options)).settings.modelProfiles).toHaveLength(1);
  expect(await options.evaluate(() => (window as any).permissionCalls)).toEqual([{ request: { origins: ["https://api.example.com/*", "https://other.example.com/*"] }, active: true }]);
  await options.evaluate(() => { (window as any).grant = true; });
  await button.click();
  await expect(options.getByRole("status")).toContainText("Configuration imported and enabled");
  expect((await fileFor(options)).settings.modelProfiles).toHaveLength(4);
  expect(await options.evaluate(() => (window as any).permissionCalls.length)).toBe(2);
});

test("imported consent cannot bypass first-use consent and permission waits cannot overwrite settings after navigation", async ({ extension: e }) => {
  await e.configure("click");
  await e.settings({ privacyConsentAccepted: false });
  const options = await e.options();
  const { settings, file } = await fileFor(options);
  settings.privacyConsentAccepted = true;
  await options.getByRole("button", { name: /Import and export/ }).click();
  await options.locator('input[type="file"]').setInputFiles(file());
  const button = options.getByRole("button", { name: "Import and enable", exact: true });
  await expect(button).toBeDisabled();
  await options.locator(".import-consent input").check();
  await button.click();
  await expect(options.getByRole("status")).toContainText("Configuration imported and enabled");
  expect((await fileFor(options)).settings.privacyConsentAccepted).toBe(true);
  settings.modelProfiles[0].apiBaseUrl = "https://pending.example.com/v1";
  await options.evaluate(() => {
    (globalThis as any).chrome.permissions.request = () => new Promise(resolve => { (window as any).releasePermission = resolve; });
  });
  await options.locator('input[type="file"]').setInputFiles(file());
  await button.click();
  await expect(options.getByRole("button", { name: "Importing…", exact: true })).toBeDisabled();
  await options.getByRole("button", { name: /Languages and behavior/ }).click();
  await options.evaluate(() => (window as any).releasePermission(true));
  await options.getByRole("button", { name: /Import and export/ }).click();
  await expect(options.locator(".import-preview")).toHaveCount(0);
  expect((await fileFor(options)).settings.modelProfiles[0].apiBaseUrl).not.toContain("pending.example.com");
});

test("model save and test request browser permission without an application confirmation", async ({ extension: e }) => {
  await e.configure("click");
  const options = await e.options();
  await options.evaluate(() => {
    (window as any).permissionCalls = [];
    (globalThis as any).chrome.permissions.request = async (request: unknown) => {
      (window as any).permissionCalls.push(request); return false;
    };
    window.confirm = () => { throw new Error("Unexpected application confirmation"); };
  });
  await options.getByRole("button", { name: /Models/ }).click();
  await options.locator(".model .profile-name").click();
  await options.getByRole("textbox", { name: "API Base URL", exact: false }).fill("https://new.example.com/v1");
  await options.getByRole("button", { name: "Save model", exact: true }).click();
  await expect(options.getByRole("alert")).toContainText("not granted");
  await options.getByRole("button", { name: "Test connection", exact: true }).click();
  await expect(options.getByRole("alert")).toContainText("not granted");
  expect(await options.evaluate(() => (window as any).permissionCalls.length)).toBe(2);
});
