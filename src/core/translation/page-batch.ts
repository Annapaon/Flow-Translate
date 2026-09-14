import type { TranslatorSettings } from "../../shared/types";
import { recordServiceCalls } from "../../shared/history";
import { streamTranslation } from "../providers";
import { isMachine, machineTranslate } from "../services/machine";
import { registerMeter } from "./meter";
import { schedule } from "./scheduler";

export class BatchFormatError extends Error {}
/** Strict IDs prevent a missing/duplicated response from shifting later paragraphs. */
export class BatchDecoder {
  private buffer = "";
  private values = new Map<string, string>();
  constructor(
    private ids: string[],
    private onValue: (id: string, text: string) => void,
  ) {}
  push(text: string) {
    this.buffer += text;
    if (this.buffer.length > 100_000)
      throw new BatchFormatError("Batch response too large");
    let end: number;
    while ((end = this.buffer.indexOf("\n")) >= 0) {
      this.line(this.buffer.slice(0, end));
      this.buffer = this.buffer.slice(end + 1);
    }
  }
  private line(line: string) {
    if (!line.trim()) return;
    let value: any;
    try {
      value = JSON.parse(line);
    } catch {
      throw new BatchFormatError("Invalid batch JSON");
    }
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => key !== "id" && key !== "text") ||
      !this.ids.includes(value.id) ||
      this.values.has(value.id) ||
      typeof value.text !== "string" ||
      !value.text.trim() ||
      value.text.length > 20_000
    )
      throw new BatchFormatError("Invalid batch paragraph");
    this.values.set(value.id, value.text);
    this.onValue(value.id, value.text);
  }
  finish() {
    this.line(this.buffer);
    if (this.values.size !== this.ids.length)
      throw new BatchFormatError("Missing batch paragraph");
    return this.ids.map((id) => this.values.get(id)!);
  }
}
interface Entry {
  text: string;
  config: TranslatorSettings;
  signal: AbortSignal;
  html: boolean;
  lane: string;
  allowed: () => Promise<unknown>;
  delta: (text: string) => void;
  reset: () => void;
  single: () => Promise<string>;
  persist: boolean;
}
interface Job extends Entry {
  resolve: (text: string) => void;
  reject: (error: unknown) => void;
  cleanup: () => void;
}
/** One broker per page port: never combines tabs, privacy contexts or language plans. */
export class PageBatcher {
  private queue: Job[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private disabled = false;
  run(entry: Entry): Promise<string> {
    entry.signal.throwIfAborted();
    if (
      this.disabled ||
      entry.config.provider === "baidu" ||
      entry.config.enableThinking ||
      entry.config.maxOutputTokens < 512 ||
      entry.text.length > 800
    )
      return entry.single();
    return new Promise((resolve, reject) => {
      const abort = () => reject(entry.signal.reason);
      entry.signal.addEventListener("abort", abort, { once: true });
      this.queue.push({
        ...entry,
        resolve,
        reject,
        cleanup: () => entry.signal.removeEventListener("abort", abort),
      });
      this.timer ??= setTimeout(() => this.flush(), 20);
    });
  }
  private flush() {
    this.timer = undefined;
    const queue = this.queue.splice(0);
    while (queue.length) {
      const first = queue.shift()!;
      if (first.signal.aborted) {
        first.cleanup();
        continue;
      }
      const group = [first];
      let size = first.text.length;
      const key = JSON.stringify(first.config);
      const budget = isMachine(first.config.provider)
        ? 2400
        : Math.min(2400, Math.floor(first.config.maxOutputTokens / 2));
      for (let i = 0; i < queue.length && group.length < 4;) {
        const candidate = queue[i]!;
        if (
          !candidate.signal.aborted &&
          candidate.html === first.html &&
          candidate.lane === first.lane &&
          JSON.stringify(candidate.config) === key &&
          size + candidate.text.length <= budget
        ) {
          group.push(...queue.splice(i, 1));
          size += candidate.text.length;
        } else i++;
      }
      void this.execute(group);
    }
  }
  private async execute(group: Job[]) {
    const first = group[0]!;
    if (group.length === 1 || this.disabled) {
      await Promise.all(
        group.map(async (job) => {
          try {
            job.signal.throwIfAborted();
            job.resolve(await job.single());
          } catch (error) {
            job.reject(error);
          } finally {
            job.cleanup();
          }
        }),
      );
      return;
    }
    const controller = new AbortController();
    const abort = () => {
      if (group.every((job) => job.signal.aborted)) controller.abort();
    };
    group.forEach((job) => job.signal.addEventListener("abort", abort));
    abort();
    let calls = 0;
    const unmeter = registerMeter(controller.signal, () => calls++);
    try {
      const results = await schedule(
        first.lane,
        true,
        controller.signal,
        async () => {
          await first.allowed();
          controller.signal.throwIfAborted();
          const timeout = setTimeout(
            () => controller.abort("timeout"),
            first.config.timeoutMs,
          );
          try {
            if (isMachine(first.config.provider)) {
              const results = await machineTranslate(
                group.map((job) => job.text),
                first.config,
                controller.signal,
                first.html,
              );
              group.forEach((job, index) => {
                if (!job.signal.aborted) job.delta(results[index]!);
              });
              return results;
            }
            const ids = group.map((_, index) => String(index));
            const decoder = new BatchDecoder(ids, (id, text) => {
              const job = group[Number(id)]!;
              if (!job.signal.aborted) job.delta(text);
            });
            await streamTranslation(
              group
                .map((job, index) =>
                  JSON.stringify({ id: ids[index], text: job.text }),
                )
                .join("\n"),
              { ...first.config, responseFormat: "batch" },
              controller.signal,
              (text) => decoder.push(text),
            );
            return decoder.finish();
          } finally {
            clearTimeout(timeout);
          }
        },
        false,
        first.config.modelProfiles.find(
          (p) => p.id === first.config.activeModelId,
        )?.maxConcurrency ?? 2,
      );
      controller.signal.throwIfAborted();
      group.forEach((job, index) => {
        if (!job.signal.aborted) job.resolve(results[index]!);
      });
    } catch (error) {
      if (error instanceof BatchFormatError && !controller.signal.aborted) {
        // Stop batching for this page session when a model ignores the protocol.
        this.disabled = true;
        await Promise.all(
          group.map(async (job) => {
            try {
              job.signal.throwIfAborted();
              job.reset();
              job.resolve(await job.single());
            } catch (failure) {
              job.reject(failure);
            }
          }),
        );
      } else group.forEach((job) => job.reject(error));
    } finally {
      unmeter();
      group.forEach((job) => {
        job.cleanup();
        job.signal.removeEventListener("abort", abort);
      });
      if (calls && first.persist)
        await recordServiceCalls(first.config.activeModelId, calls).catch(
          () => {},
        );
    }
  }
}
