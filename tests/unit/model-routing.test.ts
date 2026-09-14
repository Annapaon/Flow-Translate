import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../src/shared/types";
import { getSettings, saveSettings } from "../../src/shared/settings";
import { validateImportedSettings } from "../../src/shared/security";
import { settingsForFeature, pageSettingsFingerprint } from "../../src/core/translation/model-routing";

const profile = { ...DEFAULT_SETTINGS.modelProfiles[0]!, id: "assigned", name: "Assigned", provider: "anthropic" as const, apiKey: "test-only-key", apiBaseUrl: "https://example.com", model: "assigned-model", maxConcurrency: 5, customHeaders: { "X-Test": "assigned" } };
const settings = { ...DEFAULT_SETTINGS, modelProfiles: [...DEFAULT_SETTINGS.modelProfiles, profile], separateModels: true, featureModels: { selection: "", page: profile.id, longText: profile.id } };
describe("feature model assignments", () => {
  it("defaults to one model and migrates old configurations", async () => {
    const { separateModels, featureModels, ...old } = DEFAULT_SETTINGS;
    await saveSettings({ ...DEFAULT_SETTINGS, ...validateImportedSettings(old) });
    const read = await getSettings();
    expect(read.separateModels).toBe(false);
    expect(read.featureModels).toEqual({ selection: "", page: "", longText: "" });
  });
  it("resolves complete provider settings and leaves the default unchanged", () => {
    const routed = settingsForFeature(settings, "page");
    expect(routed).toMatchObject({ activeModelId: profile.id, apiKey: profile.apiKey, model: profile.model, provider: profile.provider, customHeaders: profile.customHeaders });
    expect(routed.modelProfiles.find(p => p.id === routed.activeModelId)?.maxConcurrency).toBe(5);
    expect(settingsForFeature(settings, "longText").activeModelId).toBe(profile.id);
    expect(settingsForFeature(settings, "selection").activeModelId).toBe(DEFAULT_SETTINGS.activeModelId);
    expect(settings.activeModelId).toBe(DEFAULT_SETTINGS.activeModelId);
  });
  it("remembers bindings while disabled and round-trips export/import", async () => {
    await saveSettings({ ...settings, separateModels: false });
    const read = await getSettings();
    expect(read.featureModels.page).toBe(profile.id);
    expect(settingsForFeature(read, "page").activeModelId).toBe(read.activeModelId);
    const imported = validateImportedSettings(JSON.parse(JSON.stringify(read)));
    expect(imported.featureModels).toEqual(settings.featureModels);
    expect(settingsForFeature({ ...read, separateModels: true }, "page").activeModelId).toBe(profile.id);
  });
  it("clears unavailable bindings and follows the current default", async () => {
    for (const profiles of [[DEFAULT_SETTINGS.modelProfiles[0]!], [DEFAULT_SETTINGS.modelProfiles[0]!, { ...profile, enabled: false }]]) {
      await saveSettings({ ...settings, modelProfiles: profiles });
      const read = await getSettings();
      expect(read.featureModels.page).toBe("");
      expect(settingsForFeature(read, "page").activeModelId).toBe(read.activeModelId);
    }
    expect(settingsForFeature({ ...settings, featureModels: { ...settings.featureModels, page: "missing" } }, "page").activeModelId).toBe(settings.activeModelId);
  });
  it("keeps a running page plan on routing edits while detecting provider and privacy changes", () => {
    const baseline = pageSettingsFingerprint(settings);
    expect(pageSettingsFingerprint({ ...settings, separateModels: false, featureModels: { selection: profile.id, page: "", longText: "" } })).toBe(baseline);
    expect(pageSettingsFingerprint({ ...settings, privacyConsentAccepted: true })).not.toBe(baseline);
    expect(pageSettingsFingerprint({ ...settings, modelProfiles: [{ ...profile, apiKey: "changed" }] })).not.toBe(baseline);
  });
  it("rejects malformed bindings and honors explicit service overrides", () => {
    expect(() => validateImportedSettings({ ...settings, featureModels: { page: 42 } })).toThrow();
    expect(settingsForFeature(settings, "selection", profile.id).activeModelId).toBe(profile.id);
    expect(() => settingsForFeature(settings, "selection", "missing")).toThrow();
  });
});
