import { afterEach, describe, expect, it, vi } from "vitest";
import {
  openLongTextPanel,
  openShortcutSettings
} from "../../src/shared/browser-platform";
import {
  getSettings,
  patchSettings,
  saveSettings,
  watchSettings
} from "../../src/shared/settings";
import { getPrivateSettings } from "../../src/shared/private-settings";
import { DEFAULT_SETTINGS } from "../../src/shared/types";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("browser UI compatibility", () => {
  it("opens Firefox's sidebar immediately in the user gesture", async () => {
    const open = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(browser.runtime, "getURL").mockReturnValue(
      "moz-extension://test/"
    );
    Object.assign(browser, { sidebarAction: { open } });
    const pending = openLongTextPanel();
    expect(open).toHaveBeenCalledExactlyOnceWith();
    await pending;
    await expect(openShortcutSettings()).rejects.toThrow("about:addons");
  });

  it("keeps Chromium's side-panel API", async () => {
    const open = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(browser.runtime, "getURL").mockReturnValue(
      "chrome-extension://test/"
    );
    vi.spyOn(browser.sidePanel, "open").mockImplementation(open);
    await openLongTextPanel();
    expect(open).toHaveBeenCalledExactlyOnceWith({ windowId: -2 });
  });
});

describe("Firefox private configuration", () => {
  function firefox() {
    vi.spyOn(browser.runtime, "getURL").mockImplementation(
      (path) => `moz-extension://test/${path}`
    );
  }

  it("keeps API keys and custom headers out of content-script-readable storage", async () => {
    firefox();
    await saveSettings({
      ...structuredClone(DEFAULT_SETTINGS),
      modelProfiles: [
        {
          ...DEFAULT_SETTINGS.modelProfiles[0]!,
          apiKey: "private-test-key",
          customHeaders: { "X-Secret": "private-header" }
        }
      ]
    });
    const persisted = await getPrivateSettings();
    expect(persisted.apiKey).toBe("private-test-key");
    const local = JSON.stringify(await browser.storage.local.get(null));
    expect(local).not.toContain("private-test-key");
    expect(local).not.toContain("private-header");
    expect(await getSettings()).toMatchObject({ apiKey: "private-test-key" });
  });

  it("notifies other views after committing and preserves concurrent edits", async () => {
    firefox();
    const changed = vi.fn();
    const unwatch = watchSettings(changed);
    try {
      await Promise.all([
        patchSettings({ enableHistory: true }),
        patchSettings({ smartOutput: true })
      ]);
      await vi.waitFor(() =>
        expect(changed).toHaveBeenLastCalledWith(
          expect.objectContaining({ enableHistory: true, smartOutput: true })
        )
      );
    } finally {
      unwatch();
    }
  });

  it("keeps session keys out of persistent IDB and clears them when reset", async () => {
    firefox();
    await saveSettings({
      ...structuredClone(DEFAULT_SETTINGS),
      keyStorage: "session",
      modelProfiles: [
        { ...DEFAULT_SETTINGS.modelProfiles[0]!, apiKey: "session-test-key" }
      ]
    });
    expect(JSON.stringify(await getPrivateSettings())).not.toContain(
      "session-test-key"
    );
    expect(JSON.stringify(await browser.storage.local.get(null))).not.toContain(
      "session-test-key"
    );
    expect((await getSettings()).apiKey).toBe("session-test-key");
    await saveSettings(structuredClone(DEFAULT_SETTINGS));
    expect(
      JSON.stringify(await browser.storage.session.get(null))
    ).not.toContain("session-test-key");
    expect((await getSettings()).apiKey).toBe("");
  });
});
