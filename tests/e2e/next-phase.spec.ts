import { test, expect, select } from "./fixtures";
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
for (const provider of ["baidu", "google", "deepl"] as const)
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
    .getByRole("checkbox", { name: "Bidirectional translation", exact: true })
    .check();
  await expect(
    options.getByRole("combobox", { name: "Pair language", exact: true }),
  ).toBeVisible();
  await expect(
    options.getByRole("combobox", {
      name: "Default target language",
      exact: true,
    }),
  ).toBeDisabled();
  await e.page
    .locator("#first")
    .evaluate((el) => (el.textContent = "今日は良い天気です"));
  await select(e.page, "#first");
  await e.page
    .getByRole("button", { name: "Translate selection", exact: true })
    .click();
  await expect(e.page.locator(".brand")).toContainText("简体中文");
  await options
    .getByRole("checkbox", { name: "Bidirectional translation", exact: true })
    .uncheck();
  await expect(
    options.getByRole("combobox", {
      name: "Default target language",
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
  await e.settings({ targetLanguage: "日本語" });
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
  await expect(panel.locator(".actions")).toContainText("Translation complete");
  expect(e.requests.length).toBeGreaterThan(1);
  expect(e.requests.length).toBeLessThan(5);
});
