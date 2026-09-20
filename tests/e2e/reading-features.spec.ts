import { test, expect } from "./fixtures";

test("region selection translates only the confirmed block and Escape cleans up", async ({
  extension: e
}) => {
  await e.configure("click");
  await e.control("region");
  await expect(e.page.locator("html")).toHaveAttribute(
    "data-flow-selecting",
    ""
  );
  await e.page.keyboard.press("Escape");
  await expect(e.page.locator("html")).not.toHaveAttribute(
    "data-flow-selecting",
    ""
  );
  expect(e.requests).toHaveLength(0);
  await e.control("region");
  await e.page.locator("#second").hover({ position: { x: 15, y: 10 } });
  await e.page.locator("#second").click({ position: { x: 15, y: 10 } });
  await expect.poll(() => e.requests.length).toBe(1);
  expect(e.requests[0]!.source).toContain("Second paragraph");
  expect(e.requests[0]!.source).not.toContain("First paragraph");
  e.finish(0);
  await expect.poll(async () => (await e.pageStatus()).state).toBe("completed");
  await expect(e.page.locator("[data-flow-translation]")).toHaveCount(1);
  await expect(e.page.locator("#flow-translate-root .card")).toHaveCount(0);
  await e.control("restore");
  await expect(e.page.locator("[data-flow-translation]")).toHaveCount(0);
});

test("appearance updates a running task without extra calls or cancellation", async ({
  extension: e
}) => {
  await e.configure("click");
  await e.control("start");
  await expect.poll(() => e.requests.length).toBe(1);
  await expect(e.page.locator("[data-flow-translation]").first()).toBeVisible();
  await e.settings({
    translationStyle: {
      scale: 1.25,
      spacing: 1,
      background: false,
      tone: "blue"
    }
  });
  await expect(e.page.locator("[data-flow-translation]").first()).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)"
  );
  expect((await e.pageStatus()).state).toBe("running");
  expect(e.requests[0]!.aborted).toBe(false);
  expect(e.requests).toHaveLength(1);
  e.finish(0);
  await expect.poll(async () => (await e.pageStatus()).state).toBe("completed");
});

test("target-language preflight skips automatic work and rechecks dynamic foreign content", async ({
  extension: e
}) => {
  await e.configure("click");
  await e.page.locator("body").evaluate((body) => {
    body.innerHTML = `<p>${"这是一篇已经使用中文撰写的文章，包含足够的文字用于语言检测。".repeat(10)}</p>`;
  });
  await e.settings({ pageTranslationMode: "auto" });
  await expect
    .poll(async () => (await e.pageStatus()).state)
    .toBe("skipped-target");
  expect(e.requests).toHaveLength(0);
  await e.page.locator("body").evaluate((body) => {
    const p = document.createElement("p");
    p.textContent = "これは日本語の文章です。翻訳してください。";
    body.append(p);
  });
  await expect.poll(() => e.requests.length).toBe(1);
  e.finish(0);
  await expect.poll(async () => (await e.pageStatus()).state).toBe("completed");
});

test("website rules override language and mode but cannot bypass page enablement", async ({
  extension: e
}) => {
  await e.configure("click");
  const rule = {
    id: "local",
    host: new URL(e.page.url()).hostname,
    subdomains: false,
    mode: "auto" as const,
    language: { kind: "fixed" as const, source: "自动检测", target: "日本語" }
  };
  await e.settings({ pageTranslationEnabled: false, siteRules: [rule] });
  await e.page.waitForTimeout(600);
  expect(e.requests).toHaveLength(0);
  await e.settings({ pageTranslationEnabled: true });
  await expect.poll(() => e.requests.length).toBe(1);
  expect(e.requests[0]!.source).toContain("目标语言：日本語");
  e.finish(0);
  await expect.poll(async () => (await e.pageStatus()).state).toBe("completed");
  await e.settings({
    siteRules: [{ ...rule, language: { ...rule.language, target: "English" } }]
  });
  await expect.poll(async () => (await e.pageStatus()).state).toBe("paused");
});



test("reading settings persist rules and appearance using existing controls", async ({
  extension: e
}) => {
  await e.configure("click");
  const options = await e.options();
  await options
    .getByRole("button", { name: /Translation/ })
    .first()
    .click();
  await options.getByText("Translation appearance", { exact: true }).click();
  await options
    .getByRole("combobox", { name: "Relative font size", exact: true })
    .selectOption("1.25");
  await options
    .getByRole("switch", { name: "Show background", exact: true })
    .uncheck();
  await options.getByText("Website rules", { exact: true }).click();
  await options
    .getByRole("button", { name: "Add website rule", exact: true })
    .click();
  await options
    .getByRole("textbox", { name: "Hostname", exact: true })
    .fill("news.example.com");
  await options
    .getByRole("combobox", { name: "Website page mode", exact: true })
    .selectOption("auto");
  await options
    .getByRole("switch", { name: "Custom website language", exact: true })
    .check();
  await options
    .locator(".website-rule-editor")
    .getByRole("combobox", { name: "Target language", exact: true })
    .selectOption("日本語");
  await options
    .getByRole("button", { name: "Save website rule", exact: true })
    .click();
  await expect
    .poll(() =>
      options.evaluate(
        async () =>
          (
            await (globalThis as any).chrome.storage.local.get(
              "translatorSettings"
            )
          ).translatorSettings.siteRules[0]?.host
      )
    )
    .toBe("news.example.com");
  await options.reload();
  await options
    .getByRole("button", { name: /Translation/ })
    .first()
    .click();
  await options.getByText("Translation appearance", { exact: true }).click();
  await expect(
    options.getByRole("combobox", { name: "Relative font size", exact: true })
  ).toHaveValue("1.25");
  await expect(
    options.getByRole("switch", { name: "Show background", exact: true })
  ).not.toBeChecked();
  await options.getByText("Website rules", { exact: true }).click();
  await expect(options.locator(".website-rule")).toContainText(
    "news.example.com"
  );
  await options.screenshot({
    path: ".output/ui-review/reading-preferences.png",
    fullPage: true
  });
});



test("website rules are excluded from exports unless explicitly selected", async ({
  extension: e
}) => {
  const { readFile } = await import("node:fs/promises");
  await e.configure("click");
  await e.settings({
    siteRules: [
      {
        id: "private-site",
        host: "private.example.com",
        subdomains: false,
        mode: "manual",
        language: { kind: "inherit" }
      }
    ]
  });
  const options = await e.options();
  await options.getByRole("button", { name: /Data/ }).click();
  const downloadSettings = async () => {
    const promise = options.waitForEvent("download");
    await options
      .getByRole("button", { name: "Export without secrets", exact: true })
      .click();
    const download = await promise;
    return JSON.parse(await readFile((await download.path())!, "utf8"));
  };
  const safe = await downloadSettings();
  expect(safe.siteRules).toBeUndefined();
  expect(safe.apiKey).toBe("");
  await options
    .getByRole("switch", {
      name: "Include website rules in export",
      exact: true
    })
    .check();
  const withRules = await downloadSettings();
  expect(withRules.siteRules[0].host).toBe("private.example.com");
  expect(withRules.apiKey).toBe("");
});
