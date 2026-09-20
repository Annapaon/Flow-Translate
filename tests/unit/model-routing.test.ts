import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../src/shared/types";
import { getSettings, saveSettings } from "../../src/shared/settings";
import { selectFeatureService } from "../../src/shared/service-selection";
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
  it("round-trips every feature switch through storage into routing (popup/sidepanel flow)", async () => {
    await saveSettings(settings);
    for (const feature of ["selection", "page", "longText"] as const) {
      // Separate mode: the switch must land on the feature binding and route.
      await selectFeatureService(feature, profile.id);
      let stored = await getSettings();
      expect(stored.featureModels[feature]).toBe(profile.id);
      expect(settingsForFeature(stored, feature).activeModelId).toBe(profile.id);
      // "Follow default" clears the binding and falls back to the default.
      await selectFeatureService(feature, "");
      stored = await getSettings();
      expect(stored.featureModels[feature]).toBe("");
      expect(settingsForFeature(stored, feature).activeModelId).toBe(stored.activeModelId);
    }
    // Unified mode: the switch moves the shared default and every feature follows.
    await saveSettings({ ...settings, separateModels: false });
    await selectFeatureService("selection", profile.id);
    const unified = await getSettings();
    expect(unified.activeModelId).toBe(profile.id);
    expect(unified.separateModels).toBe(false);
    for (const feature of ["selection", "page", "longText"] as const) {
      expect(settingsForFeature(unified, feature).activeModelId).toBe(profile.id);
    }
    // A disabled target must be rejected, not silently kept.
    await saveSettings({ ...settings, modelProfiles: [...settings.modelProfiles, { ...profile, id: "off", enabled: false }] });
    await expect(selectFeatureService("selection", "off")).rejects.toThrow("翻译服务不可用");
  });
});
