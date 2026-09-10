// Dynamic tests for core/providers/* and shared/security.ts against a local
// mock SSE server. Run with `npm test` (vitest).
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isRetryableTranslationError, streamTranslation } from "../core/providers/index";
import { redactSensitive, sanitizeHeaders, validateApiUrl } from "../shared/security";
import type { TranslatorSettings } from "../shared/types";

function makeSettings(overrides: Partial<TranslatorSettings> = {}): TranslatorSettings {
  return {
    privacyConsentAccepted: true, uiLanguage: "zh-CN", keyStorage: "local", sensitiveDefaultsApplied: true,
    modelProfiles: [{ id: "p1", enabled: true, provider: "openai-compatible", name: "t", apiBaseUrl: "http://localhost:0/v1", apiKey: "", model: "m", temperature: 0.2, timeoutMs: 60000, maxOutputTokens: 2048, customHeaders: {}, authMode: "bearer" }],
    activeModelId: "p1", provider: "openai-compatible", apiBaseUrl: "http://localhost:0/v1",
    apiKey: "sk-test", model: "m", targetLanguage: "简体中文", sourceLanguage: "自动检测",
    outputMode: "translation", translationScene: "general",
    scenePrompts: { general: "g", technical: "t", academic: "a", business: "b" },
    triggerMode: "click", enableThinking: false, enableHistory: false, enableCache: true,
    blockedSites: [], allowedSites: [], siteAccessMode: "blacklist",
    temperature: 0.2, timeoutMs: 60000, maxOutputTokens: 2048, customHeaders: {},
    minChars: 2, maxChars: 5000, systemPrompt: "sys {{targetLanguage}}",
    ...overrides
  } as TranslatorSettings;
}

let server: Server;
let port: number;
let base: string;
let serverBehavior: (req: any, res: any, body: string) => void = () => {};

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => serverBehavior(req, res, body));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const address = server.address();
  port = typeof address === "object" && address ? address.port : 0;
  base = `http://localhost:${port}/v1`;
});

afterAll(() => { server?.close(); });

function sse(res: any, events: unknown[]) {
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  for (const e of events) res.write(`data: ${JSON.stringify(e)}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

describe("openai-compatible streaming", () => {
  it("parses think tags across chunk boundaries", async () => {
    serverBehavior = (_req, res) => sse(res, [
      { choices: [{ delta: { content: "<th" } }] },
      { choices: [{ delta: { content: "ink>reason" } }] },
      { choices: [{ delta: { content: "ing here</thi" } }] },
      { choices: [{ delta: { content: "nk>" } }] },
      { choices: [{ delta: { content: "  你好" } }] },
      { choices: [{ delta: { content: "世界" } }] }
    ]);
    let answer = "", reasoning = "";
    await streamTranslation("hello", makeSettings({ apiBaseUrl: base, enableThinking: true }), new AbortController().signal, (t) => (answer += t), (t) => (reasoning += t));
    expect(reasoning).toBe("reasoning here");
    expect(answer).toBe("你好世界");
  });

  it("forwards reasoning_content then content", async () => {
    serverBehavior = (_req, res) => sse(res, [
      { choices: [{ delta: { reasoning_content: "step1" } }] },
      { choices: [{ delta: { reasoning_content: "step2" } }] },
      { choices: [{ delta: { content: "result" } }] }
    ]);
    let answer = "", reasoning = "";
    await streamTranslation("hello", makeSettings({ apiBaseUrl: base, enableThinking: true }), new AbortController().signal, (t) => (answer += t), (t) => (reasoning += t));
    expect(reasoning).toBe("step1step2");
    expect(answer).toBe("result");
  });

  it("hides think-tag reasoning when thinking is disabled", async () => {
    let answer = "", reasoning = "";
    serverBehavior = (_req, res) => sse(res, [{ choices: [{ delta: { content: "<think>secret</think>visible" } }] }]);
    await streamTranslation("hello", makeSettings({ apiBaseUrl: base, enableThinking: false }), new AbortController().signal, (t) => (answer += t), (t) => (reasoning += t));
    expect(reasoning).toBe("");
    expect(answer).toBe("visible");
  });

  it("builds the chat-completions endpoint without doubling", async () => {
    let seenUrl = "";
    serverBehavior = (req, res) => { seenUrl = req.url; sse(res, [{ choices: [{ delta: { content: "x" } }] }]); };
    await streamTranslation("hello", makeSettings({ apiBaseUrl: `http://localhost:${port}/v1` }), new AbortController().signal, () => {});
    expect(seenUrl).toBe("/v1/chat/completions");
    await streamTranslation("hello", makeSettings({ apiBaseUrl: `http://localhost:${port}/v1/chat/completions` }), new AbortController().signal, () => {});
    expect(seenUrl).toBe("/v1/chat/completions");
  });

  it("sends the expected request body", async () => {
    let seenBody: any = null;
    serverBehavior = (_req, res, body) => { seenBody = JSON.parse(body); sse(res, [{ choices: [{ delta: { content: "x" } }] }]); };
    await streamTranslation("hello", makeSettings({ apiBaseUrl: base }), new AbortController().signal, () => {});
    expect(seenBody.stream).toBe(true);
    expect(seenBody.model).toBe("m");
    expect(seenBody.max_tokens).toBe(2048);
    expect(seenBody.enable_thinking).toBe(false);
    expect(seenBody.messages[0].content).toContain("sys 简体中文");
    expect(seenBody.messages[1].content).toContain("<source_text>\nhello\n</source_text>");
  });

  it("retries without enable_thinking when the server rejects it (400)", async () => {
    const calls: any[] = [];
    serverBehavior = (_req, res, body) => {
      calls.push(JSON.parse(body));
      if (calls.length === 1) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Unsupported parameter: enable_thinking" } }));
      } else sse(res, [{ choices: [{ delta: { content: "ok" } }] }]);
    };
    let answer = "";
    await streamTranslation("hello", makeSettings({ apiBaseUrl: base }), new AbortController().signal, (t) => (answer += t));
    expect(calls.length).toBe(2);
    expect("enable_thinking" in calls[1]).toBe(false);
    expect(answer).toBe("ok");
  });

  it("switches max_tokens to max_completion_tokens on 400", async () => {
    const calls: any[] = [];
    serverBehavior = (_req, res, body) => {
      calls.push(JSON.parse(body));
      if (calls.length === 1) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "max_tokens is deprecated, use max_completion_tokens" } }));
      } else sse(res, [{ choices: [{ delta: { content: "ok" } }] }]);
    };
    await streamTranslation("hello", makeSettings({ apiBaseUrl: base }), new AbortController().signal, () => {});
    expect(calls.length).toBe(2);
    expect(calls[1].max_completion_tokens).toBe(2048);
    expect("max_tokens" in calls[1]).toBe(false);
  });

  it("classifies 429 as retryable and 401 as not", async () => {
    serverBehavior = (_req, res) => { res.writeHead(429); res.end(JSON.stringify({ error: { message: "rate limited" } })); };
    let err: any;
    try { await streamTranslation("hello", makeSettings({ apiBaseUrl: base }), new AbortController().signal, () => {}); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(Error);
    expect(isRetryableTranslationError(err)).toBe(true);
    expect(String(err.message)).toContain("rate limited");

    serverBehavior = (_req, res) => { res.writeHead(401); res.end(JSON.stringify({ error: { message: "bad key sk-live" } })); };
    try { await streamTranslation("hello", makeSettings({ apiBaseUrl: base, apiKey: "sk-live" }), new AbortController().signal, () => {}); } catch (e) { err = e; }
    expect(isRetryableTranslationError(err)).toBe(false);
    expect(String(err.message)).not.toContain("sk-live");
  });

  it("rejects on mid-stream abort and is not retryable", async () => {
    serverBehavior = (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "a" } }] })}\n\n`);
      // never ends
    };
    const controller = new AbortController();
    const p = streamTranslation("hello", makeSettings({ apiBaseUrl: base }), controller.signal, () => {});
    setTimeout(() => controller.abort("timeout"), 50);
    let err: any;
    try { await p; } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(isRetryableTranslationError(err)).toBe(false);
  });
});

describe("anthropic provider", () => {
  it("hits /v1/messages with x-api-key and streams text deltas", async () => {
    let seenUrl = "", seenHeaders: any = null, seenBody: any = null;
    serverBehavior = (req, res, body) => {
      seenUrl = req.url; seenHeaders = req.headers; seenBody = JSON.parse(body);
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "bon" } })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "jour" } })}\n\n`);
      res.end();
    };
    let answer = "";
    const settings = makeSettings({ provider: "anthropic", apiBaseUrl: `http://localhost:${port}`, apiKey: "key123" });
    settings.modelProfiles[0].provider = "anthropic";
    settings.modelProfiles[0].authMode = "x-api-key";
    await streamTranslation("hello", settings, new AbortController().signal, (t) => (answer += t));
    expect(seenUrl).toBe("/v1/messages");
    expect(seenHeaders["x-api-key"]).toBe("key123");
    expect(seenHeaders["anthropic-version"]).toBe("2023-06-01");
    expect(seenBody.max_tokens).toBe(2048);
    expect(seenBody.stream).toBe(true);
    expect(Array.isArray(seenBody.messages)).toBe(true);
    expect(answer).toBe("bonjour");
  });
});

describe("gemini provider", () => {
  it("hits streamGenerateContent with x-goog-api-key", async () => {
    let seenUrl = "", seenHeaders: any = null;
    serverBehavior = (req, res) => {
      seenUrl = req.url; seenHeaders = req.headers;
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "hallo" }] } }] })}\n\n`);
      res.end();
    };
    let answer = "";
    await streamTranslation("hello", makeSettings({ provider: "gemini", apiBaseUrl: `http://localhost:${port}/v1beta`, apiKey: "gk" }), new AbortController().signal, (t) => (answer += t));
    expect(seenUrl.startsWith("/v1beta/models/m:streamGenerateContent")).toBe(true);
    expect(seenHeaders["x-goog-api-key"]).toBe("gk");
    expect(answer).toBe("hallo");
  });
});

describe("credential requirements", () => {
  it("rejects cloud providers without a key but allows local ones", async () => {
    let err: any;
    try { await streamTranslation("hello", makeSettings({ provider: "openai-compatible", apiKey: "  " }), new AbortController().signal, () => {}); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(Error);
    expect(/API Key/.test(err.message)).toBe(true);

    serverBehavior = (_req, res) => sse(res, [{ choices: [{ delta: { content: "x" } }] }]);
    let okLocal = true;
    try { await streamTranslation("hello", makeSettings({ provider: "ollama", apiBaseUrl: base, apiKey: "" }), new AbortController().signal, () => {}); } catch { okLocal = false; }
    expect(okLocal).toBe(true);
  });
});

describe("validateApiUrl", () => {
  it("enforces HTTPS except loopback/LAN", () => {
    expect(() => validateApiUrl("http://example.com/v1")).toThrow();
    expect(validateApiUrl("https://api.openai.com/v1/")).toBe("https://api.openai.com/v1");
    expect(validateApiUrl("http://localhost:11434/v1").startsWith("http://localhost:11434")).toBe(true);
    expect(validateApiUrl("http://127.0.0.1:8000/v1")).toContain("127.0.0.1");
    expect(validateApiUrl("http://[::1]:8000/v1")).toContain("::1");
    expect(() => validateApiUrl("https://user:pass@api.example.com")).toThrow();
  });
});

describe("redactSensitive", () => {
  it("redacts secrets and known headers", () => {
    const out = redactSensitive("Authorization: Bearer sk-abcdef123 and ?key=topsecret", ["sk-abcdef123"]);
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("sk-abcdef123");
    expect(out).not.toContain("topsecret");
  });
});

describe("sanitizeHeaders", () => {
  it("rejects invalid names and CRLF, keeps valid headers", () => {
    expect(() => sanitizeHeaders({ "Bad Header": "x" })).toThrow();
    expect(() => sanitizeHeaders({ "X-Ok": "a\nb" })).toThrow();
    expect(sanitizeHeaders({ "X-Ok": "value" })["X-Ok"]).toBe("value");
  });
});

describe("untrusted provider response security", () => {
  it("redacts echoed custom credentials before truncating diagnostics", async () => {
    const secret = "private-gateway-token-123456789";
    serverBehavior = (_req, res) => {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("x".repeat(490) + secret);
    };
    const settings = makeSettings({ apiBaseUrl: base, customHeaders: { "X-Gateway-Token": secret } });
    try {
      await streamTranslation("hello", settings, new AbortController().signal, () => {});
      throw new Error("Expected service error");
    } catch (error) {
      expect(String(error)).not.toContain("private-ga");
      expect(String(error)).toContain("REDACTED");
    }
  });

  it("bounds error bodies and cancels oversized streams", async () => {
    const { readLimitedText, MAX_STREAM_BUFFER } = await import("../core/providers/sse");
    let cancelled = false;
    const response = new Response(new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(65536)); },
      cancel() { cancelled = true; }
    }));
    expect(MAX_STREAM_BUFFER).toBeGreaterThan(65536);
    await expect(readLimitedText(response)).rejects.toThrow("安全限制");
    expect(cancelled).toBe(true);
    expect(response.body?.locked).toBe(false);
  });

  it("bounds cumulative SSE bytes even when each event is small", async () => {
    const { sseEvents } = await import("../core/providers/sse");
    let cancelled = false;
    const bytes = new TextEncoder().encode('data: {"text":"' + 'x'.repeat(32000) + '"}\n\n');
    const response = new Response(new ReadableStream({
      pull(controller) { controller.enqueue(bytes); },
      cancel() { cancelled = true; }
    }));
    await expect((async () => { for await (const _event of sseEvents(response)) { /* consume */ } })()).rejects.toThrow("安全限制");
    expect(cancelled).toBe(true);
    expect(response.body?.locked).toBe(false);
  });
});
