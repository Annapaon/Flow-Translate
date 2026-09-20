import { describe, it, expect, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../src/shared/types";
import { resolveSettings } from "../../src/core/translation/language";
import { machineTranslate, ServiceError } from "../../src/core/services/machine";
import { schedule } from "../../src/core/translation/scheduler";
import { getSettings, saveSettings } from "../../src/shared/settings";
import { validateImportedSettings } from "../../src/shared/security";
import {
  createCacheKey,
  cacheTranslation,
  findCachedTranslation,
} from "../../src/shared/history";
import SparkMD5 from "spark-md5";

describe("translation rules and migration", () => {
  it("keeps fixed settings and resolves Japanese, Chinese and overrides independently", async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      bidirectional: true,
      pairLanguage: "日本語",
    };
    expect(
      (await resolveSettings("今日は良い天気です", settings)).settings
        .targetLanguage,
    ).toBe("简体中文");
    expect(
      (await resolveSettings("这是一段用来测试翻译方向的中文文字", settings))
        .settings.targetLanguage,
    ).toBe("日本語");
    expect(
      (await resolveSettings("手紙", settings, "ja")).settings.targetLanguage,
    ).toBe("简体中文");
    expect(
      (await resolveSettings("手紙", settings, "", "日本語")).settings
        .targetLanguage,
    ).toBe("日本語");
    expect(settings.targetLanguage).toBe("简体中文");
  });
  it("only sends matching directional terms and keeps explicit output choices", async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      sourceLanguage: "English",
      smartOutput: true,
      outputMode: "grammar" as const,
      terms: [
        {
          source: "cache",
          target: "缓存",
          sourceLanguage: "English",
          targetLanguage: "简体中文",
          preserve: false,
        },
        {
          source: "",
          target: "bad",
          sourceLanguage: "auto",
          targetLanguage: "简体中文",
          preserve: false,
        },
      ],
    };
    const { settings: effective } = await resolveSettings("cache", settings);
    expect(effective.outputMode).toBe("grammar");
    expect(effective.systemPrompt).toContain("缓存");
    expect(effective.systemPrompt).not.toContain("bad");
    expect(
      (await resolveSettings("cache", settings, "", undefined, true)).settings
        .outputMode,
    ).toBe("translation");
  });
  it("preserves IDs and session secrets for machine service profiles", async () => {
    const profile = {
      ...DEFAULT_SETTINGS.modelProfiles[0]!,
      provider: "baidu" as const,
      model: "",
      appId: "app-123",
      apiKey: "secret-value",
    };
    const imported = validateImportedSettings({
      ...DEFAULT_SETTINGS,
      modelProfiles: [profile],
      keyStorage: "session",
    });
    await saveSettings({ ...DEFAULT_SETTINGS, ...imported });
    const read = await getSettings();
    expect(read.modelProfiles[0]?.id).toBe(profile.id);
    expect(read.modelProfiles[0]?.kind).toBe("machine");
    expect(read.apiKey).toBe("secret-value");
    expect(read.schemaVersion).toBe(2);
    expect(read.bidirectional).toBe(false);
  });
  it("isolates page and selection cache capacity and honors pre-commit cancellation", async () => {
    const key = await createCacheKey("hello", DEFAULT_SETTINGS);
    await cacheTranslation("selection:" + key, "saved");
    for (let i = 0; i < 105; i++)
      await cacheTranslation("page:" + i, "page result");
    expect(await findCachedTranslation("selection:" + key)).toBe("saved");
    const c = new AbortController();
    c.abort();
    await expect(
      cacheTranslation("page:cancelled", "no", c.signal),
    ).rejects.toBeDefined();
    expect(await findCachedTranslation("page:cancelled")).toBeNull();
  });
});

describe("official service contracts", () => {
  for (const provider of ["baidu", "microsoft", "google"] as const) {
    it(`${provider} builds auth and validates translated output`, async () => {
      const profile = {
        ...DEFAULT_SETTINGS.modelProfiles[0]!,
        provider,
        apiBaseUrl: "https://example.com/translate",
        apiKey: "test-secret",
        appId: "app-id",
        region: "eastasia",
      };
      const config = {
        ...DEFAULT_SETTINGS,
        provider,
        modelProfiles: [profile],
        sourceLanguage: "English",
        targetLanguage: "日本語",
      };
      const response =
        provider === "baidu"
          ? { trans_result: [{ dst: "こんにちは" }] }
          : provider === "microsoft"
            ? [{ translations: [{ text: "こんにちは" }] }]
            : provider === "google"
              ? { data: { translations: [{ translatedText: "こんにちは" }] } }
              : { translations: [{ text: "こんにちは" }] };
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(response)));
      try {
        expect(
          await machineTranslate(
            ["hello"],
            config,
            new AbortController().signal,
          ),
        ).toEqual(["こんにちは"]);
        const [url, options] = fetch.mock.calls[0]!;
        const headers = options!.headers as Record<string, string>;
        if (provider === "baidu") {
          const body = new URLSearchParams(options!.body as string);
          expect(body.get("to")).toBe("jp");
          expect(body.get("sign")).toBe(
            SparkMD5.hash("app-idhello" + body.get("salt") + "test-secret"),
          );
        }
        if (provider === "microsoft") {
          expect(headers["Ocp-Apim-Subscription-Region"]).toBe("eastasia");
          expect(String(url)).toContain("to=ja");
        }
        if (provider === "google")
          expect(headers["X-Goog-Api-Key"]).toBe("test-secret");
      } finally {
        fetch.mockRestore();
      }
    });
  }
  it("preserves array order and rejects missing results", async () => {
    const profile = {
      ...DEFAULT_SETTINGS.modelProfiles[0]!,
      provider: "microsoft" as const,
      apiBaseUrl: "https://example.com",
      apiKey: "key",
    };
    const settings = {
      ...DEFAULT_SETTINGS,
      provider: profile.provider,
      modelProfiles: [profile],
    };
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify([
            { translations: [{ text: "one" }] },
            { translations: [{ text: "two" }] },
          ]),
        ),
      );
    try {
      expect(
        await machineTranslate(
          ["a", "b"],
          settings,
          new AbortController().signal,
          true,
        ),
      ).toEqual(["one", "two"]);
      fetch.mockResolvedValue(
        new Response(JSON.stringify([{ translations: [{ text: "one" }] }])),
      );
      await expect(
        machineTranslate(["a", "b"], settings, new AbortController().signal),
      ).rejects.toThrow("Missing");
    } finally {
      fetch.mockRestore();
    }
  });
  it("classifies quota/auth errors without exposing server text and respects Retry-After", async () => {
    const profile = {
      ...DEFAULT_SETTINGS.modelProfiles[0]!,
      provider: "google" as const,
      apiKey: "private-key",
    };
    const s = {
      ...DEFAULT_SETTINGS,
      provider: profile.provider,
      modelProfiles: [profile],
    };
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("private-key", {
        status: 429,
        headers: { "Retry-After": "3" },
      }),
    );
    try {
      await expect(
        machineTranslate(["a"], s, new AbortController().signal),
      ).rejects.toMatchObject({ retryAfter: 3000, retryable: true });
      fetch.mockResolvedValue(new Response("private-key", { status: 403 }));
      await expect(
        machineTranslate(["a"], s, new AbortController().signal),
      ).rejects.toMatchObject({ fatal: true });
    } finally {
      fetch.mockRestore();
    }
  });
});

it("prioritizes queued selections over queued page jobs and removes cancelled jobs", async () => {
  let release!: () => void;
  const order: string[] = [];
  const a = new AbortController();
  const first = schedule(
    "priority-test",
    true,
    a.signal,
    () =>
      new Promise<void>((r) => {
        release = r;
      }),
    true,
  );
  const second = schedule(
    "priority-test",
    true,
    a.signal,
    async () => {
      order.push("page");
    },
    true,
  );
  const third = schedule(
    "priority-test",
    false,
    a.signal,
    async () => {
      order.push("selection");
    },
    true,
  );
  const cancelled = new AbortController();
  const fourth = schedule(
    "priority-test",
    true,
    cancelled.signal,
    async () => {
      order.push("cancelled");
    },
    true,
  );
  cancelled.abort();
  await expect(fourth).rejects.toBeDefined();
  release();
  await Promise.all([first, second, third]);
  expect(order).toEqual(["selection", "page"]);
});

it("does not fetch when cancelled during asynchronous settings loading", async () => {
  const settingsModule = await import("../../src/shared/settings");
  const { attachTranslationPort } = await import("../../src/core/translation/port");
  let listener!: (m: unknown) => Promise<void>;
  let disconnect!: () => void;
  const port = {
    name: "translation-stream",
    sender: { id: "test" },
    postMessage: vi.fn(),
    onMessage: {
      addListener: (fn: typeof listener) => {
        listener = fn;
      },
    },
    onDisconnect: {
      addListener: (fn: () => void) => {
        disconnect = fn;
      },
    },
  };
  let release!: (s: typeof DEFAULT_SETTINGS) => void;
  const read = vi.spyOn(settingsModule, "getSettings").mockImplementationOnce(
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  const fetch = vi.spyOn(globalThis, "fetch");
  try {
    attachTranslationPort(port as any);
    const running = listener({
      type: "translate",
      requestId: "cancel-test",
      text: "Hello",
    });
    await listener({ type: "cancel", requestId: "cancel-test" });
    release({ ...DEFAULT_SETTINGS, privacyConsentAccepted: true });
    await running;
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    disconnect();
    read.mockRestore();
    fetch.mockRestore();
  }
});

it("normalizes regional hints and matches complete Latin terms", async () => {
  const { languageCode, matchesTerm } =
    await import("../../src/core/translation/language");
  expect(languageCode("en-US")).toBe("en");
  expect(languageCode("zh-HK")).toBe("zh-TW");
  expect(matchesTerm("cached value", "cache")).toBe(false);
  expect(matchesTerm("the cache.", "cache")).toBe(true);
  expect(matchesTerm("使用缓存系统", "缓存")).toBe(true);
});

it("stops queued requests for the same credentials after a fatal service error", async () => {
  const signal = new AbortController().signal;
  let rejectFirst!: (e: unknown) => void;
  let queuedRan = false;
  const first = schedule(
    "fatal-test",
    true,
    signal,
    () =>
      new Promise<void>((_, reject) => {
        rejectFirst = reject;
      }),
    true,
  );
  const second = schedule(
    "fatal-test",
    true,
    signal,
    async () => {
      queuedRan = true;
    },
    true,
  );
  const firstCheck = expect(first).rejects.toMatchObject({ fatal: true });
  const secondCheck = expect(second).rejects.toMatchObject({ fatal: true });
  rejectFirst(new ServiceError("Account unavailable", false, true));
  await Promise.all([firstCheck, secondCheck]);
  expect(queuedRan).toBe(false);
});

it("supports arbitrary distinct language pairs for selection and page translation", async () => {
  const settings = { ...DEFAULT_SETTINGS, bidirectional: true, pairSourceLanguage: "English", pairLanguage: "日本語", targetLanguage: "Deutsch" };
  expect((await resolveSettings("今日は良い天気です", settings)).settings.targetLanguage).toBe("English");
  expect((await resolveSettings("Hello world", settings, "en")).settings.targetLanguage).toBe("日本語");
  expect((await resolveSettings("今日は良い天気です", settings, "ja", undefined, true)).settings.targetLanguage).toBe("English");
  expect((await resolveSettings("中文文本", settings, "zh")).settings.targetLanguage).toBe("English");
  expect((await resolveSettings("Hello", { ...settings, bidirectional: false })).settings.targetLanguage).toBe("Deutsch");
});

it("migrates old language pairs and normalizes invalid or duplicate languages", async () => {
  await saveSettings({ ...DEFAULT_SETTINGS, pairSourceLanguage: undefined!, pairLanguage: "English" });
  expect((await getSettings()).pairSourceLanguage).toBe("简体中文");
  expect((await getSettings()).pairLanguage).toBe("English");
  await saveSettings({ ...DEFAULT_SETTINGS, pairSourceLanguage: "en", pairLanguage: "English" });
  const settings = await getSettings();
  expect(settings.pairSourceLanguage).toBe("English");
  expect(settings.pairLanguage).not.toBe("English");
  const imported = validateImportedSettings({ ...settings, pairSourceLanguage: "Français", pairLanguage: "Deutsch", modelProfiles: [{ ...settings.modelProfiles[0]!, model: "test" }] });
  expect(imported.pairSourceLanguage).toBe("Français");
  expect(imported.pairLanguage).toBe("Deutsch");
});

it("defaults page translation to manual, imports preferences and gates shortcut commands", async () => {
  const { handleTranslationCommand } = await import("../../src/core/translation/commands");
  expect(DEFAULT_SETTINGS.pageTranslationMode).toBe("manual");
  const send = vi.spyOn(browser.tabs, "sendMessage").mockResolvedValue({});
  try {
    await saveSettings({ ...DEFAULT_SETTINGS, privacyConsentAccepted: true, pageTranslationEnabled: false });
    await handleTranslationCommand("translate-page", { id: 7 });
    expect(send).not.toHaveBeenCalled();
    await saveSettings({ ...DEFAULT_SETTINGS, privacyConsentAccepted: true });
    await handleTranslationCommand("translate-page", { id: 7 });
    expect(send).toHaveBeenCalledWith(7, { type: "page-shortcut" });
    await handleTranslationCommand("translate-selection", { id: 7 });
    expect(send).toHaveBeenLastCalledWith(7, { type: "translate-current-selection" });
    const imported = validateImportedSettings({ ...DEFAULT_SETTINGS, pageTranslationMode: "auto", pageTranslationEnabled: false });
    expect(imported.pageTranslationMode).toBe("auto");
    expect(imported.pageTranslationEnabled).toBe(false);
    expect(imported.privacyConsentAccepted).toBe(false);
  } finally { send.mockRestore(); }
});

it("ignores queued translation messages after a port disconnects", async () => {
  const { attachTranslationPort } = await import("../../src/core/translation/port");
  const settings = await import("../../src/shared/settings");
  let listener!: (message: unknown) => Promise<void>;
  let disconnect!: () => void;
  const port = { name: "translation-stream", postMessage: vi.fn(), onMessage: { addListener: (fn: typeof listener) => listener = fn }, onDisconnect: { addListener: (fn: () => void) => disconnect = fn } };
  const read = vi.spyOn(settings, "getSettings");
  try {
    attachTranslationPort(port as any);
    disconnect();
    await listener({ type: "translate", requestId: "late", text: "Late queued message" });
    expect(read).not.toHaveBeenCalled();
    expect(port.postMessage).not.toHaveBeenCalled();
  } finally { read.mockRestore(); }
});
