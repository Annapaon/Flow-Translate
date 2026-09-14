/** Opaque per-profile lane shared by every translation surface and connection test. */
export async function modelLane(
  origin: string,
  profile: { id: string; apiKey: string },
) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify([origin, profile.apiKey, profile.id]),
    ),
  );
  return Array.from(new Uint8Array(digest)).join(".");
}
interface Work {
  priority: number;
  signal: AbortSignal;
  run: () => Promise<unknown>;
  resolve: (v: any) => void;
  reject: (e: unknown) => void;
  cleanup: () => void;
}
interface Lane {
  active: number;
  queue: Work[];
  next: number;
  timer?: ReturnType<typeof setTimeout>;
  limit: number;
  spacing: number;
  ceiling: number;
  successes: number;
  strikes: number;
}
const lanes = new Map<string, Lane>();
export function schedule<T>(
  key: string,
  page: boolean,
  signal: AbortSignal,
  run: () => Promise<T>,
  slow = false,
  concurrency = 2,
): Promise<T> {
  signal.throwIfAborted();
  const ceiling = slow
    ? 1
    : Math.max(1, Math.min(6, Math.floor(concurrency) || 2));
  let lane = lanes.get(key);
  if (!lane) {
    lane = {
      active: 0,
      queue: [],
      next: 0,
      limit: ceiling,
      ceiling,
      successes: 0,
      strikes: 0,
      spacing: slow ? 1100 : 100,
    };
    lanes.set(key, lane);
  }
  if (lane.ceiling !== ceiling) {
    lane.ceiling = ceiling;
    lane.limit = Math.min(lane.limit, ceiling);
    if (!lane.strikes) lane.limit = ceiling;
  }
  const current = lane;
  return new Promise((resolve, reject) => {
    const work: Work = {
      priority: page ? 1 : 0,
      signal,
      run,
      resolve,
      reject,
      cleanup: () => signal.removeEventListener("abort", abort),
    };
    const abort = () => {
      const i = current.queue.indexOf(work);
      if (i >= 0) {
        current.queue.splice(i, 1);
        work.cleanup();
        reject(signal.reason);
        drain(key, current);
      }
    };
    signal.addEventListener("abort", abort, { once: true });
    current.queue.push(work);
    current.queue.sort((a, b) => a.priority - b.priority);
    drain(key, current);
  });
}
function drain(key: string, lane: Lane) {
  if (lane.timer || lane.active >= lane.limit) return;
  if (!lane.queue.length) {
    if (!lane.active) {
      const remaining = lane.next - Date.now();
      if (lane.strikes && remaining > 0) {
        lane.timer = setTimeout(() => {
          lane.timer = undefined;
          drain(key, lane);
        }, remaining);
      } else lanes.delete(key);
    }
    return;
  }
  const delay = lane.next - Date.now();
  if (delay > 0) {
    lane.timer = setTimeout(() => {
      lane.timer = undefined;
      drain(key, lane);
    }, delay);
    return;
  }
  const work = lane.queue.shift()!;
  work.cleanup();
  if (work.signal.aborted) {
    work.reject(work.signal.reason);
    drain(key, lane);
    return;
  }
  lane.active++;
  lane.next = Date.now() + lane.spacing;
  work
    .run()
    .then(
      (value) => {
        if (++lane.successes >= 3) {
          lane.limit = Math.min(lane.ceiling, lane.limit + 1);
          lane.successes = 0;
          lane.strikes = Math.max(0, lane.strikes - 1);
        }
        work.resolve(value);
      },
      (error: unknown) => {
        if (
          error &&
          typeof error === "object" &&
          "status" in error &&
          error.status === 429
        ) {
          lane.strikes++;
          lane.successes = 0;
          lane.limit = Math.max(1, Math.floor(lane.limit / 2));
          const retryAfter =
            "retryAfter" in error ? Number(error.retryAfter) : 0;
          lane.next = Math.max(
            lane.next,
            Date.now() +
              Math.min(
                60_000,
                Math.max(
                  retryAfter || 0,
                  1000 * 2 ** Math.min(lane.strikes - 1, 6),
                ),
              ),
          );
          if (lane.timer) {
            clearTimeout(lane.timer);
            lane.timer = undefined;
          }
        }
        if (
          error &&
          typeof error === "object" &&
          "fatal" in error &&
          error.fatal
        ) {
          for (const queued of lane.queue.splice(0)) {
            queued.cleanup();
            queued.reject(error);
          }
        }
        work.reject(error);
      },
    )
    .finally(() => {
      lane.active--;
      drain(key, lane);
    });
  drain(key, lane);
}
export function delay(ms: number, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
