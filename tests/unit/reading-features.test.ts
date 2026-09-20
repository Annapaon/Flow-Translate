import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  DEFAULT_PUBLIC_SETTINGS
} from "../../src/shared/types";
import {
  forWebsite,
  siteRulesSchema,
  translationStyleSchema
} from "../../src/shared/reading-settings";
import { pageSettingsFingerprint } from "../../src/core/translation/model-routing";
import { isTargetLanguagePage } from "../../src/core/translation/page-preflight";
import { diagnose } from "../../src/core/providers/diagnostics";
import { httpError } from "../../src/core/providers/errors";
import { testConnection } from "../../src/core/providers";

const parent = {
  id: "parent",
  host: "example.com",
  subdomains: true,
  mode: "auto" as const,
  language: { kind: "fixed" as const, source: "自动检测", target: "日本語" }
};
const child = {
  ...parent,
  id: "child",
  host: "news.example.com",
  mode: "manual" as const,
  language: { kind: "pair" as const, first: "简体中文", second: "日本語" }
};
describe("website and reading preferences", () => {
  it("matches exact rules before suffix rules without matching lookalike domains", () => {
    const settings = { ...DEFAULT_SETTINGS, siteRules: [parent, child] };
    expect(forWebsite(settings, "https://news.example.com/a")).toMatchObject({
      pageTranslationMode: "manual",
      bidirectional: true,
      pairLanguage: "日本語"
    });
    expect(
      forWebsite(settings, "https://other.example.com").targetLanguage
    ).toBe("日本語");
    expect(forWebsite(settings, "https://example.com.evil.test")).toBe(
      settings
    );
    expect(forWebsite(settings, "chrome-extension://example.com/page")).toBe(
      settings
    );
    expect(forWebsite(settings)).toBe(settings);
    expect(
      forWebsite(
        { ...settings, pageTranslationEnabled: false },
        "https://example.com"
      ).pageTranslationEnabled
    ).toBe(false);
  });
  it("validates hostnames, duplicate rules, distinct languages and style ranges", () => {
    expect(
      siteRulesSchema.parse([{ ...parent, host: "例子.测试" }])[0]!.host
    ).toMatch(/^xn--/);
    for (const host of [
      "https://example.com",
      "example.com/path",
      "user@example.com",
      "*.example.com",
      "-bad.com"
    ])
      expect(siteRulesSchema.safeParse([{ ...parent, host }]).success).toBe(
        false
      );
    expect(
      siteRulesSchema.safeParse([parent, { ...parent, id: "duplicate" }])
        .success
    ).toBe(false);
    expect(
      siteRulesSchema.safeParse([
        {
          ...child,
          language: { kind: "pair", first: "English", second: "English" }
        }
      ]).success
    ).toBe(false);
    expect(
      translationStyleSchema.safeParse({
        ...DEFAULT_SETTINGS.translationStyle,
        scale: 8
      }).success
    ).toBe(false);
    expect(
      translationStyleSchema.safeParse({
        ...DEFAULT_SETTINGS.translationStyle,
        css: "url(evil)"
      }).success
    ).toBe(false);
  });
  it("ignores appearance changes but invalidates a changed effective language", () => {
    expect(
      pageSettingsFingerprint({
        ...DEFAULT_SETTINGS,
        translationStyle: { ...DEFAULT_SETTINGS.translationStyle, scale: 1.25 }
      })
    ).toBe(pageSettingsFingerprint(DEFAULT_SETTINGS));
    expect(
      pageSettingsFingerprint(
        forWebsite(
          { ...DEFAULT_SETTINGS, siteRules: [parent] },
          "https://example.com"
        )
      )
    ).not.toBe(pageSettingsFingerprint(DEFAULT_SETTINGS));
  });
  it("preflights sufficiently long target-language text conservatively", async () => {
    const spy = vi
      .spyOn(browser.i18n, "detectLanguage")
      .mockResolvedValue({
        isReliable: true,
        languages: [{ language: "zh-CN", percentage: 100 }]
      });
    try {
      const chinese =
        "这是一篇已经使用中文撰写的文章，包含足够的文字供语言检测使用。".repeat(
          8
        );
      expect(
        await isTargetLanguagePage([chinese], DEFAULT_PUBLIC_SETTINGS)
      ).toBe(true);
      expect(
        await isTargetLanguagePage(["短文"], DEFAULT_PUBLIC_SETTINGS)
      ).toBe(false);
      expect(
        await isTargetLanguagePage(
          [chinese, "これは日本語の文章です。"],
          DEFAULT_PUBLIC_SETTINGS
        )
      ).toBe(false);
      expect(
        await isTargetLanguagePage([chinese], {
          ...DEFAULT_PUBLIC_SETTINGS,
          bidirectional: true
        })
      ).toBe(false);
      spy.mockResolvedValue({ isReliable: false, languages: [] });
      expect(
        await isTargetLanguagePage(
          ["A short English article. ".repeat(12)],
          DEFAULT_PUBLIC_SETTINGS
        )
      ).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("connection diagnostics", () => {
  it("distinguishes explicit quota codes from rate limits and does not expose server bodies", () => {
    expect(
      diagnose(
        httpError(
          429,
          '{"error":{"code":"insufficient_quota","message":"SECRET"}}'
        )
      ).code
    ).toBe("quota");
    const result = diagnose(httpError(429, "SECRET", false, [], 3000));
    expect(result).toMatchObject({ code: "rate_limit", retryAfter: 3000 });
    expect(result.message).not.toContain("SECRET");
    expect(diagnose({ code: "54005" }).code).toBe("rate_limit");
    expect(diagnose(httpError(403, "SECRET")).code).toBe("forbidden");
    expect(diagnose(httpError(401, "SECRET")).code).toBe("authentication");
    expect(diagnose(new TypeError("SECRET")).code).toBe("network");
    expect(diagnose(new Error("SECRET"), false, true).code).toBe("timeout");
  });
  it("does not call the service for invalid configuration or missing permission", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const permission = vi
      .spyOn(browser.permissions, "contains")
      .mockResolvedValue(false);
    try {
      expect((await testConnection(DEFAULT_SETTINGS)).code).toBe(
        "configuration"
      );
      expect(
        (await testConnection({ ...DEFAULT_SETTINGS, apiKey: "test-key" })).code
      ).toBe("permission");
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
      permission.mockRestore();
    }
  });
});
