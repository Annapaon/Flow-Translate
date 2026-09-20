import { redactSensitive } from "../../shared/security";

export class TranslationRequestError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly status = 0, readonly retryAfter = 0, readonly code = "") {
    super(message);
    this.name = "TranslationRequestError";
  }
  get fatal() { return [401, 403, 456].includes(this.status); }
}

export function isRetryableTranslationError(error: unknown): boolean {
  return error instanceof TranslationRequestError
    ? error.retryable
    : error instanceof TypeError;
}

function safeErrorMessage(status: number, body: string, english = false, secrets: string[] = []): string {
  let detail = body;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string };
    const message = parsed.error?.message ?? parsed.message;
    if (typeof message === "string") detail = message;
  } catch {
    // The response was not JSON; use the shortened body.
  }
  detail = redactSensitive(detail, secrets).slice(0, 500);
  return english ? `Request failed (HTTP ${status})${detail ? `: ${detail}` : ""}` : `请求失败（HTTP ${status}）${detail ? `：${detail}` : ""}`;
}

export function httpError(status: number, body: string, english = false, secrets: string[] = [], retryAfter = 0): TranslationRequestError {
  let code = "";
  try { const parsed = JSON.parse(body); code = String(parsed.error?.code ?? parsed.error?.type ?? "").slice(0, 100); } catch { /* No structured code. */ }
  return new TranslationRequestError(
    safeErrorMessage(status, body, english, secrets),
    status === 408 || status === 409 || status === 425 || status === 429 || status >= 500, status, retryAfter, code
  );
}
