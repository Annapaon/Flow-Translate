import { test, expect, select } from "./fixtures";

for (const selector of ["#first", "#second", "#input", "#textarea"]) {
  test(`click translation streams selected text: ${selector}`, async ({ extension: e }) => {
    await e.configure("click");
    await select(e.page, selector);
    await e.page.getByRole("button", { name: "Translate selection", exact: true }).click();
    await expect(e.page.locator(".result")).toHaveText("译文");
    expect(e.requests).toHaveLength(1);
    expect(e.requests[0]!.source).toContain(await e.page.locator(".source").innerText());
    e.finish(0);
    await expect(e.page.locator(".result")).toHaveText("译文完成");
    await expect(e.page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  });
}

test("auto mode waits for a stable selection and translates only the latest range", async ({ extension: e }) => {
  await e.configure("auto");
  await select(e.page, "#first");
  await e.page.waitForTimeout(200);
  expect(e.requests).toHaveLength(0);
  await select(e.page, "#second", false);
  await e.page.waitForTimeout(250);
  expect(e.requests).toHaveLength(0);
  await expect.poll(() => e.requests.length).toBe(1);
  expect(e.requests[0]!.source).toContain("Second paragraph");
  e.finish(0);
  await expect(e.page.locator(".result")).toHaveText("译文完成");
  await e.page.waitForTimeout(500);
  expect(e.requests).toHaveLength(1);
});

test("moving to an identical paragraph resets the stability window", async ({ extension: e }) => {
  await e.configure("auto");
  await select(e.page, "#first");
  await e.page.waitForTimeout(200);
  await select(e.page, "#same", false);
  await e.page.waitForTimeout(250);
  expect(e.requests).toHaveLength(0);
  await expect.poll(() => e.requests.length).toBe(1);
});

test("reselection aborts the old stream and clearing selection cancels the new one", async ({ extension: e }) => {
  await e.configure("click");
  await select(e.page, "#first");
  await e.page.getByRole("button", { name: "Translate selection", exact: true }).click();
  await expect(e.page.locator(".result")).toHaveText("译文");
  await select(e.page, "#second");
  await expect.poll(() => e.requests[0]?.aborted).toBe(true);
  await e.page.getByRole("button", { name: "Translate selection", exact: true }).click();
  await expect(e.page.locator(".source")).toContainText("Second paragraph");
  await expect(e.page.locator(".result")).toHaveText("译文");
  await e.page.locator("#outside").click();
  await expect(e.page.locator(".card")).toHaveCount(0);
  await expect.poll(() => e.requests[1]?.aborted).toBe(true);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`overlay follows ${colorScheme} theme`, async ({ extension: e }) => {
    await e.page.emulateMedia({ colorScheme });
    await e.configure("click");
    await select(e.page, "#first");
    await e.page.getByRole("button", { name: "Translate selection", exact: true }).click();
    await expect(e.page.locator(".result")).toHaveCSS("background-color", colorScheme === "dark" ? "rgb(17, 24, 39)" : "rgb(255, 255, 255)");
  });
}

test("clearing a pending automatic selection sends no request", async ({ extension: e }) => {
  await e.configure("auto");
  await select(e.page, "#first");
  await e.page.locator("#outside").click();
  await e.page.waitForTimeout(500);
  expect(e.requests).toHaveLength(0);
  await expect(e.page.locator(".card")).toHaveCount(0);
});

test("automatic translation waits until the pointer selection ends", async ({ extension: e }) => {
  await e.configure("auto");
  await e.page.locator("#first").dispatchEvent("pointerdown");
  await select(e.page, "#first", false);
  await e.page.waitForTimeout(500);
  expect(e.requests).toHaveLength(0);
  await e.page.locator("#first").dispatchEvent("pointerup");
  await expect.poll(() => e.requests.length).toBe(1);
});

test("SPA navigation closes the overlay and aborts translation", async ({ extension: e }) => {
  await e.configure("click");
  await select(e.page, "#first");
  await e.page.getByRole("button", { name: "Translate selection", exact: true }).click();
  await expect(e.page.locator(".result")).toHaveText("译文");
  await e.page.evaluate(() => history.pushState({}, "", "/next"));
  await expect(e.page.locator(".card")).toHaveCount(0);
  await expect.poll(() => e.requests[0]?.aborted).toBe(true);
});
