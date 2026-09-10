// Per-request hooks count fetch attempts (including protocol retries), never billable usage.
const meters = new WeakMap<AbortSignal, () => void>();
export function registerMeter(signal: AbortSignal, meter: () => void) {
  meters.set(signal, meter);
  return () => meters.delete(signal);
}
export function networkAttempt(signal?: AbortSignal | null) {
  if (signal) meters.get(signal)?.();
}
