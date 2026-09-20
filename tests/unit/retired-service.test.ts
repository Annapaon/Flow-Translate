import { describe, expect, it } from "vitest";
import { storage } from "wxt/utils/storage";
import { DEFAULT_SETTINGS } from "../../src/shared/types";
import { getSettings } from "../../src/shared/settings";
import { validateImportedSettings } from "../../src/shared/security";
import { getSessionKeys, saveSessionKeys } from "../../src/shared/credentials";

const retired = { ...DEFAULT_SETTINGS.modelProfiles[0]!, id: "old-deepl", provider: "deepl", apiBaseUrl: "https://api-free.deepl.com/v2/translate", apiKey: "old-test-key", model: "" };

describe("retired DeepL configuration", () => {
  it("removes retired profiles, repairs default and feature bindings, and persists remaining credentials", async () => {
    const kept = { ...DEFAULT_SETTINGS.modelProfiles[0]!, id: "kept", apiKey: "kept-test-key" };
    await storage.setItem("local:translatorSettings", { ...DEFAULT_SETTINGS, provider: "deepl", activeModelId: retired.id, apiKey: retired.apiKey, modelProfiles: [retired, kept], featureModels: { selection: retired.id, page: kept.id, longText: "" } });
    const settings = await getSettings();
    expect(settings.modelProfiles).toEqual([expect.objectContaining(kept)]);
    expect(settings.activeModelId).toBe(kept.id);
    expect(settings.apiKey).toBe(kept.apiKey);
    expect(settings.featureModels).toEqual({ selection: "", page: kept.id, longText: "" });
    expect(JSON.stringify(await storage.getItem("local:translatorSettings"))).not.toContain("old-test-key");
  });

  it("resets a DeepL-only session profile without reusing its endpoint or credentials", async () => {
    await storage.setItem("local:translatorSettings", { ...DEFAULT_SETTINGS, provider: "deepl", apiBaseUrl: retired.apiBaseUrl, apiKey: "", keyStorage: "session", activeModelId: retired.id, modelProfiles: [{ ...retired, apiKey: "" }] });
    await saveSessionKeys({ [retired.id]: "old-session-key" });
    const settings = await getSettings();
    expect(settings.provider).toBe("openai-compatible");
    expect(settings.apiBaseUrl).toBe(DEFAULT_SETTINGS.apiBaseUrl);
    expect(settings.apiKey).toBe("");
    expect(await getSessionKeys()).toEqual({});
    expect((await getSettings()).activeModelId).toBe(settings.activeModelId);
  });

  it("strips retired profiles from mixed imports and only rejects DeepL-only files", () => {
    const kept = { ...DEFAULT_SETTINGS.modelProfiles[0]!, id: "kept", apiKey: "kept-test-key" };
    const imported = validateImportedSettings({ ...DEFAULT_SETTINGS, modelProfiles: [retired, kept] });
    expect(imported.modelProfiles?.map((profile) => profile.id)).toEqual(["kept"]);
    expect(() => validateImportedSettings({ ...DEFAULT_SETTINGS, modelProfiles: [retired] })).toThrow("DeepL");
  });
});
