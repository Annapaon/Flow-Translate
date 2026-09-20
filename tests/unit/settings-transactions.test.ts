import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../src/shared/types";
import { getSettings, patchSettings, saveSettings, saveSettingsChanges } from "../../src/shared/settings";
import { selectFeatureService } from "../../src/shared/service-selection";
import { pageAccessMessage, pageAccessReason } from "../../src/shared/page-access";
import { DEFAULT_PUBLIC_SETTINGS } from "../../src/shared/types";

describe("settings transactions", () => {
  it("serializes unrelated patches and merges stale feature/scene edits", async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, modelProfiles: ["a", "b"].map(id => ({ ...DEFAULT_SETTINGS.modelProfiles[0]!, id })), activeModelId: "a", separateModels: true });
    const before = await getSettings();
    await Promise.all([
      patchSettings({ enableHistory: true }),
      selectFeatureService("selection", "b"),
      saveSettingsChanges(before, { ...before, featureModels: { ...before.featureModels, page: "b" }, scenePrompts: { ...before.scenePrompts, technical: "Technical prompt" } })
    ]);
    const after = await getSettings();
    expect(after.enableHistory).toBe(true);
    expect(after.featureModels).toEqual({ selection: "b", page: "b", longText: "" });
    expect(after.scenePrompts.technical).toBe("Technical prompt");
  });
  it("does not restore removed profiles and preserves concurrently edited fields", async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, modelProfiles: ["a", "b"].map(id => ({ ...DEFAULT_SETTINGS.modelProfiles[0]!, id })), activeModelId: "a" });
    const before = await getSettings();
    await saveSettingsChanges(before, { ...before, modelProfiles: before.modelProfiles.filter(p => p.id !== "b").map(p => ({ ...p, apiKey: "new-key" })) });
    await saveSettingsChanges(before, { ...before, modelProfiles: before.modelProfiles.map(p => ({ ...p, name: "new-name" })) });
    expect((await getSettings()).modelProfiles).toEqual([expect.objectContaining({ id: "a", apiKey: "new-key", name: "new-name" })]);
  });
  it("keeps session credentials across unrelated updates", async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, keyStorage: "session", modelProfiles: [{ ...DEFAULT_SETTINGS.modelProfiles[0]!, apiKey: "session-key" }] });
    await Promise.all([patchSettings({ smartOutput: true }), patchSettings({ outputMode: "grammar" })]);
    const settings = await getSettings();
    expect(settings.apiKey).toBe("session-key");
    expect(settings.smartOutput).toBe(true);
    expect(settings.outputMode).toBe("grammar");
  });
});

describe("page access reasons", () => {
  const url = "https://example.org";
  const ready = { ...DEFAULT_PUBLIC_SETTINGS, privacyConsentAccepted: true };
  it("distinguishes prerequisites without suggesting a generic unsupported page", () => {
    expect(pageAccessReason(undefined, url, true, true)).toBe("settings-loading");
    expect(pageAccessReason(ready, "chrome://settings", true, true)).toBe("unsupported");
    expect(pageAccessReason(ready, url, false, true)).toBe("frame");
    expect(pageAccessReason({ ...ready, privacyConsentAccepted: false }, url, true, true)).toBe("consent");
    expect(pageAccessReason({ ...ready, paused: true }, url, true, true)).toBe("paused");
    expect(pageAccessReason({ ...ready, pageTranslationEnabled: false }, url, true, true)).toBe("disabled");
    expect(pageAccessReason({ ...ready, blockedSites: ["example.org"] }, url, true, true)).toBe("blocked");
    expect(pageAccessReason(ready, url, true, true)).toBeUndefined();
    expect(pageAccessMessage("consent", false)).toContain("同意");
  });
});
