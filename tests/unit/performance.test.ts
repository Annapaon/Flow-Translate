import { afterEach, describe, expect, it, vi } from "vitest";
import { schedule } from "../../src/core/translation/scheduler";
import { BatchDecoder, PageBatcher } from "../../src/core/translation/page-batch";
import { DEFAULT_SETTINGS } from "../../src/shared/types";
import { getSettings, saveSettings } from "../../src/shared/settings";
import { validateImportedSettings } from "../../src/shared/security";
import * as providers from "../../src/core/providers";
import * as machine from "../../src/core/services/machine";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
for (const limit of [1, 2, 6])
  it(`enforces configured concurrency ${limit} across selection and page requests`, async () => {
    vi.useFakeTimers();
    let active = 0,
      peak = 0;
    const work = Array.from({ length: 12 }, (_, index) =>
      schedule(
        `limit-${limit}`,
        index % 2 === 0,
        new AbortController().signal,
        async () => {
          peak = Math.max(peak, ++active);
          await new Promise((resolve) => setTimeout(resolve, 1000));
          active--;
        },
        false,
        limit,
      ),
    );
    await vi.runAllTimersAsync();
    await Promise.all(work);
    expect(peak).toBe(limit);
  });
it("holds every queued request during rate-limit cooldown and lowers concurrency", async () => {
  vi.useFakeTimers();
  const signal = new AbortController().signal;
  const first = schedule(
    "cooldown",
    true,
    signal,
    async () => {
      throw new machine.ServiceError("limited", true, false, 3000, 429);
    },
    false,
    4,
  );
  const rejected = expect(first).rejects.toMatchObject({ status: 429 });
  let started = 0;
  const next = Array.from({ length: 4 }, () =>
    schedule(
      "cooldown",
      true,
      signal,
      async () => {
        started++;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      },
      false,
      4,
    ),
  );
  await rejected;
  await vi.advanceTimersByTimeAsync(2999);
  expect(started).toBe(0);
  await vi.advanceTimersByTimeAsync(101);
  expect(started).toBe(2);
  await vi.runAllTimersAsync();
  await Promise.all(next);
});
it("migrates, bounds and imports per-profile concurrency", async () => {
  for (const [input, expected] of [
    [undefined, 2],
    [0, 1],
    [99, 6],
    [3.8, 3],
  ] as const) {
    await saveSettings({
      ...DEFAULT_SETTINGS,
      modelProfiles: [
        { ...DEFAULT_SETTINGS.modelProfiles[0]!, maxConcurrency: input },
      ],
    });
    expect((await getSettings()).modelProfiles[0]?.maxConcurrency).toBe(
      expected,
    );
  }
  expect(
    validateImportedSettings({
      ...DEFAULT_SETTINGS,
      modelProfiles: [
        { ...DEFAULT_SETTINGS.modelProfiles[0]!, maxConcurrency: 6 },
      ],
    }).modelProfiles?.[0]?.maxConcurrency,
  ).toBe(6);
  expect(() =>
    validateImportedSettings({
      ...DEFAULT_SETTINGS,
      modelProfiles: [
        { ...DEFAULT_SETTINGS.modelProfiles[0]!, maxConcurrency: 7 },
      ],
    }),
  ).toThrow();
});
describe("batch paragraph identity", () => {
  it("streams complete JSON lines and restores ID order without interpreting HTML", () => {
    const values: string[] = [];
    const decoder = new BatchDecoder(["0", "1"], (_, text) =>
      values.push(text),
    );
    decoder.push('{"id":"1","text":"<script>unsafe</script>"}\n{"id":');
    expect(values).toEqual(["<script>unsafe</script>"]);
    decoder.push('"0","text":"译文\\n第二行"}');
    expect(decoder.finish()).toEqual([
      "译文\n第二行",
      "<script>unsafe</script>",
    ]);
  });
  for (const output of [
    '{"id":"0","text":"a"}\n{"id":"0","text":"b"}',
    '{"id":"unknown","text":"a"}',
    '{"id":"0","text":"a"}',
    "```json\n{}\n```",
  ]) {
    it(`rejects ambiguous output ${output.slice(0, 25)}`, () => {
      const decoder = new BatchDecoder(["0", "1"], () => {});
      expect(() => {
        decoder.push(output);
        decoder.finish();
      }).toThrow();
    });
  }
});
function entry(text: string, signal = new AbortController().signal) {
  return {
    text,
    signal,
    config: DEFAULT_SETTINGS,
    lane: crypto.randomUUID(),
    html: true,
    persist: false,
    allowed: vi.fn(async () => {}),
    delta: vi.fn(),
    reset: vi.fn(),
    single: vi.fn(async () => "fallback"),
  };
}
it("combines four paragraphs into one LLM request and emits completed paragraphs before EOF", async () => {
  let release!: () => void;
  const stream = vi
    .spyOn(providers, "streamTranslation")
    .mockImplementation(async (text, config, signal, delta) => {
      expect(config.responseFormat).toBe("batch");
      const rows = text.split("\n").map((line) => JSON.parse(line));
      delta(JSON.stringify({ id: rows[0].id, text: "first" }) + "\n");
      await new Promise<void>((resolve) => (release = resolve));
      rows
        .slice(1)
        .forEach((row) =>
          delta(JSON.stringify({ id: row.id, text: row.text + "译文" }) + "\n"),
        );
    });
  const broker = new PageBatcher();
  const entries = Array.from({ length: 4 }, (_, i) => ({
    ...entry(`text${i}`),
    lane: "batch-success",
  }));
  const results = entries.map((item) => broker.run(item));
  await vi.waitFor(() =>
    expect(entries[0]!.delta).toHaveBeenCalledWith("first"),
  );
  release();
  expect(await Promise.all(results)).toEqual([
    "first",
    "text1译文",
    "text2译文",
    "text3译文",
  ]);
  expect(stream).toHaveBeenCalledTimes(1);
  entries.forEach((item) => expect(item.single).not.toHaveBeenCalled());
});
it("clears previews and falls back to single requests when batch IDs are missing", async () => {
  vi.spyOn(providers, "streamTranslation").mockImplementation(
    async (_, __, ___, delta) => delta('{"id":"0","text":"preview"}\n'),
  );
  const broker = new PageBatcher();
  const entries = [entry("a"), entry("b")].map((item) => ({
    ...item,
    lane: "batch-fallback",
  }));
  expect(await Promise.all(entries.map((item) => broker.run(item)))).toEqual([
    "fallback",
    "fallback",
  ]);
  entries.forEach((item) => {
    expect(item.reset).toHaveBeenCalledOnce();
    expect(item.single).toHaveBeenCalledOnce();
  });
  const later = entry("later");
  await broker.run(later);
  expect(later.single).toHaveBeenCalledOnce();
});
it("cancels one paragraph without aborting other paragraphs in its batch", async () => {
  let release!: () => void;
  let networkSignal!: AbortSignal;
  vi.spyOn(providers, "streamTranslation").mockImplementation(
    async (_, __, signal, delta) => {
      networkSignal = signal;
      await new Promise<void>((resolve) => (release = resolve));
      delta('{"id":"0","text":"a"}\n{"id":"1","text":"b"}\n');
    },
  );
  const broker = new PageBatcher();
  const controller = new AbortController();
  const a = { ...entry("a", controller.signal), lane: "batch-cancel" };
  const b = { ...entry("b"), lane: "batch-cancel" };
  const p = broker.run(a),
    q = broker.run(b);
  const rejected = expect(p).rejects.toBeDefined();
  await vi.waitFor(() => expect(release).toBeDefined());
  controller.abort();
  await rejected;
  expect(networkSignal.aborted).toBe(false);
  release();
  expect(await q).toBe("b");
  expect(a.delta).not.toHaveBeenCalled();
});
it("uses native machine batches with the original HTML and result order", async () => {
  const native = vi
    .spyOn(machine, "machineTranslate")
    .mockResolvedValue(["one", "two"]);
  const broker = new PageBatcher();
  const entries = [entry("<b>a</b>"), entry("<i>b</i>")].map((item) => ({
    ...item,
    lane: "native-batch",
    config: { ...DEFAULT_SETTINGS, provider: "microsoft" as const },
  }));
  expect(await Promise.all(entries.map((item) => broker.run(item)))).toEqual([
    "one",
    "two",
  ]);
  expect(native).toHaveBeenCalledOnce();
  expect(native.mock.calls[0]![0]).toEqual(["<b>a</b>", "<i>b</i>"]);
  expect(native.mock.calls[0]![3]).toBe(true);
});

it("aborts the shared network when every paragraph is cancelled", async () => {
  let networkSignal!: AbortSignal;
  vi.spyOn(providers, "streamTranslation").mockImplementation(
    async (_, __, signal) => {
      networkSignal = signal;
      await new Promise<void>((_, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        }),
      );
    },
  );
  const broker = new PageBatcher();
  const controllers = [new AbortController(), new AbortController()];
  const promises = controllers.map((controller) =>
    broker.run({ ...entry("text", controller.signal), lane: "cancel-all" }),
  );
  const settled = Promise.allSettled(promises);
  await vi.waitFor(() => expect(networkSignal).toBeDefined());
  controllers.forEach((controller) => controller.abort());
  expect((await settled).every((result) => result.status === "rejected")).toBe(
    true,
  );
  expect(networkSignal.aborted).toBe(true);
});
