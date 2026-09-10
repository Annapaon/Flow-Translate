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
}
const lanes = new Map<string, Lane>();
export function schedule<T>(
  key: string,
  page: boolean,
  signal: AbortSignal,
  run: () => Promise<T>,
  slow = false,
): Promise<T> {
  signal.throwIfAborted();
  let lane = lanes.get(key);
  if (!lane) {
    lane = {
      active: 0,
      queue: [],
      next: 0,
      limit: slow ? 1 : 2,
      spacing: slow ? 1100 : 100,
    };
    lanes.set(key, lane);
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
    if (!lane.active) lanes.delete(key);
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
    .then(work.resolve, (error: unknown) => {
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
    })
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
