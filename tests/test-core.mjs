// Dynamic tests for core/openai.ts and shared/security.ts against a local mock SSE server.
// Run with `npm test` (jiti).
import { createServer } from "node:http";
import { streamTranslation, isRetryableTranslationError } from "../core/openai.ts";
import { validateApiUrl, sanitizeHeaders, redactSensitive } from "../shared/security.ts";

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed++; console.log(`PASS ${name}`); }
  else { failed++; console.log(`FAIL ${name} ${detail}`); }
}

function makeSettings(overrides = {}) {
  return {
    privacyConsentAccepted: true, uiLanguage: "zh-CN",
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
  };
}

// ---------- mock SSE server ----------
let serverBehavior = null;
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => serverBehavior(req, res, body));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const base = `http://localhost:${port}/v1`;

function sse(res, events) {
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  for (const e of events) res.write(`data: ${JSON.stringify(e)}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

// Test 1: basic streaming + think-tag parsing
serverBehavior = (req, res) => {
  sse(res, [
    { choices: [{ delta: { content: "<th" } }] },
    { choices: [{ delta: { content: "ink>reason" } }] },
    { choices: [{ delta: { content: "ing here</thi" } }] },
    { choices: [{ delta: { content: "nk>" } }] },
    { choices: [{ delta: { content: "  你好" } }] },
    { choices: [{ delta: { content: "世界" } }] }
  ]);
};
{
  let answer = "", reasoning = "";
  const settings = makeSettings({ apiBaseUrl: base, enableThinking: true });
  await streamTranslation("hello", settings, new AbortController().signal, (t) => (answer += t), (t) => (reasoning += t));
  check("think-tag reasoning parsed", reasoning === "reasoning here", JSON.stringify(reasoning));
  check("think-tag answer parsed (leading ws stripped)", answer === "你好世界", JSON.stringify(answer));
}

// Test 2: reasoning_content field
serverBehavior = (req, res) => {
  sse(res, [
    { choices: [{ delta: { reasoning_content: "step1" } }] },
    { choices: [{ delta: { reasoning_content: "step2" } }] },
    { choices: [{ delta: { content: "result" } }] }
  ]);
};
{
  let answer = "", reasoning = "";
  await streamTranslation("hello", makeSettings({ apiBaseUrl: base, enableThinking: true }), new AbortController().signal, (t) => (answer += t), (t) => (reasoning += t));
  check("reasoning_content forwarded", reasoning === "step1step2", JSON.stringify(reasoning));
  check("content after reasoning", answer === "result", JSON.stringify(answer));
}

// Test 3: enableThinking=false still parses think tags (hidden)
{
  let answer = "", reasoning = "";
  serverBehavior = (req, res) => sse(res, [
    { choices: [{ delta: { content: "<think>secret</think>visible" } }] }
  ]);
  await streamTranslation("hello", makeSettings({ apiBaseUrl: base, enableThinking: false }), new AbortController().signal, (t) => (answer += t), (t) => (reasoning += t));
  check("think hidden when disabled", reasoning === "" && answer === "visible", JSON.stringify({ answer, reasoning }));
}

// Test 4: endpoint path — server records URL
{
  let seenUrl = "";
  serverBehavior = (req, res) => { seenUrl = req.url; sse(res, [{ choices: [{ delta: { content: "x" } }] }]); };
  await streamTranslation("hello", makeSettings({ apiBaseUrl: `http://localhost:${port}/v1` }), new AbortController().signal, () => {});
  check("openai endpoint appends /chat/completions", seenUrl === "/v1/chat/completions", seenUrl);
  await streamTranslation("hello", makeSettings({ apiBaseUrl: `http://localhost:${port}/v1/chat/completions` }), new AbortController().signal, () => {});
  check("openai endpoint not doubled", seenUrl === "/v1/chat/completions", seenUrl);
}

// Test 5: request body shape
{
  let seenBody = null;
  serverBehavior = (req, res, body) => { seenBody = JSON.parse(body); sse(res, [{ choices: [{ delta: { content: "x" } }] }]); };
  await streamTranslation("hello", makeSettings({ apiBaseUrl: base }), new AbortController().signal, () => {});
  check("body has stream+model+max_tokens", seenBody.stream === true && seenBody.model === "m" && seenBody.max_tokens === 2048);
  check("body sends enable_thinking by default", seenBody.enable_thinking === false);
  check("system prompt template rendered", seenBody.messages[0].content.includes("sys 简体中文"), seenBody.messages[0].content);
  check("user text wrapped", seenBody.messages[1].content.includes("<source_text>\nhello\n</source_text>"));
}

// Test 6: 400 enable_thinking rejection → retry without field
{
  let calls = [];
  serverBehavior = (req, res, body) => {
    calls.push(JSON.parse(body));
    if (calls.length === 1) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Unsupported parameter: enable_thinking" } }));
    } else sse(res, [{ choices: [{ delta: { content: "ok" } }] }]);
  };
  let answer = "";
  await streamTranslation("hello", makeSettings({ apiBaseUrl: base }), new AbortController().signal, (t) => (answer += t));
  check("retried without enable_thinking on 400", calls.length === 2 && !("enable_thinking" in calls[1]) && answer === "ok");
}

// Test 7: 400 max_tokens → switch to max_completion_tokens
{
  let calls = [];
  serverBehavior = (req, res, body) => {
    calls.push(JSON.parse(body));
    if (calls.length === 1) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "max_tokens is deprecated, use max_completion_tokens" } }));
    } else sse(res, [{ choices: [{ delta: { content: "ok" } }] }]);
  };
  await streamTranslation("hello", makeSettings({ apiBaseUrl: base }), new AbortController().signal, () => {});
  check("switched to max_completion_tokens", calls.length === 2 && calls[1].max_completion_tokens === 2048 && !("max_tokens" in calls[1]));
}

// Test 8: HTTP 429 is retryable, 401 is not
{
  serverBehavior = (req, res) => { res.writeHead(429); res.end(JSON.stringify({ error: { message: "rate limited" } })); };
  let err;
  try { await streamTranslation("hello", makeSettings({ apiBaseUrl: base }), new AbortController().signal, () => {}); } catch (e) { err = e; }
  check("429 retryable", err && isRetryableTranslationError(err), String(err));
  check("429 message has detail", err && String(err.message).includes("rate limited"), err?.message);
  serverBehavior = (req, res) => { res.writeHead(401); res.end(JSON.stringify({ error: { message: "bad key sk-live" } })); };
  try { await streamTranslation("hello", makeSettings({ apiBaseUrl: base, apiKey: "sk-live" }), new AbortController().signal, () => {}); } catch (e) { err = e; }
  check("401 not retryable", err && !isRetryableTranslationError(err));
}

// Test 9: abort mid-stream
{
  serverBehavior = (req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "a" } }] })}\n\n`);
    // never ends
  };
  const controller = new AbortController();
  const p = streamTranslation("hello", makeSettings({ apiBaseUrl: base }), controller.signal, () => {});
  setTimeout(() => controller.abort("timeout"), 50);
  let err;
  try { await p; } catch (e) { err = e; }
  check("abort rejects stream", err !== undefined);
  check("abort not retryable", err && !isRetryableTranslationError(err));
}

// Test 10: anthropic endpoint + SSE events
{
  let seenUrl = "", seenHeaders = null, seenBody = null;
  serverBehavior = (req, res, body) => {
    seenUrl = req.url; seenHeaders = req.headers; seenBody = JSON.parse(body);
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "bon" } })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "jour" } })}\n\n`);
    res.end();
  };
  let answer = "";
  const settings = makeSettings({ provider: "anthropic", apiBaseUrl: `http://localhost:${port}`, apiKey: "key123", authMode: undefined });
  settings.modelProfiles[0].provider = "anthropic";
  settings.modelProfiles[0].authMode = "x-api-key";
  await streamTranslation("hello", settings, new AbortController().signal, (t) => (answer += t));
  check("anthropic endpoint /v1/messages", seenUrl === "/v1/messages", seenUrl);
  check("anthropic x-api-key header", seenHeaders["x-api-key"] === "key123");
  check("anthropic-version header", seenHeaders["anthropic-version"] === "2023-06-01");
  check("anthropic body shape", seenBody.max_tokens === 2048 && seenBody.stream === true && Array.isArray(seenBody.messages));
  check("anthropic streamed text", answer === "bonjour", answer);
}

// Test 11: gemini endpoint
{
  let seenUrl = "", seenHeaders = null;
  serverBehavior = (req, res, body) => {
    seenUrl = req.url; seenHeaders = req.headers;
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "hallo" }] } }] })}\n\n`);
    res.end();
  };
  let answer = "";
  await streamTranslation("hello", makeSettings({ provider: "gemini", apiBaseUrl: `http://localhost:${port}/v1beta`, apiKey: "gk" }), new AbortController().signal, (t) => (answer += t));
  check("gemini endpoint streamGenerateContent", seenUrl.startsWith("/v1beta/models/m:streamGenerateContent"), seenUrl);
  check("gemini api key header", seenHeaders["x-goog-api-key"] === "gk");
  check("gemini streamed text", answer === "hallo", answer);
}

// Test 12: missing API key for cloud providers
{
  let err;
  try { await streamTranslation("hello", makeSettings({ provider: "openai-compatible", apiKey: "  " }), new AbortController().signal, () => {}); } catch (e) { err = e; }
  check("cloud without key rejected", err && /API Key/.test(err.message));
  // local provider without key should proceed
  serverBehavior = (req, res) => sse(res, [{ choices: [{ delta: { content: "x" } }] }]);
  let okLocal = true;
  try { await streamTranslation("hello", makeSettings({ provider: "ollama", apiBaseUrl: base, apiKey: "" }), new AbortController().signal, () => {}); } catch (e) { okLocal = false; }
  check("local provider without key allowed", okLocal);
}

// Test 13: validateApiUrl rules
{
  let err;
  try { validateApiUrl("http://example.com/v1"); } catch (e) { err = e; }
  check("http non-local rejected", !!err);
  check("https ok", validateApiUrl("https://api.openai.com/v1/") === "https://api.openai.com/v1");
  check("localhost http ok", validateApiUrl("http://localhost:11434/v1").startsWith("http://localhost:11434"));
  check("127.0.0.1 ok", validateApiUrl("http://127.0.0.1:8000/v1").includes("127.0.0.1"));
  check("[::1] ok", validateApiUrl("http://[::1]:8000/v1").includes("::1"));
  try { validateApiUrl("https://user:pass@api.example.com"); } catch (e) { err = e; }
  check("credentials in URL rejected", !!err);
}

// Test 14: redactSensitive
{
  const out = redactSensitive('Authorization: Bearer sk-abcdef123 and ?key=topsecret', ["sk-abcdef123"]);
  check("redact secrets", out.includes("[REDACTED]") && !out.includes("sk-abcdef123") && !out.includes("topsecret"), out);
}

// Test 15: sanitizeHeaders
{
  let err;
  try { sanitizeHeaders({ "Bad Header": "x" }); } catch (e) { err = e; }
  check("invalid header name rejected", !!err);
  err = undefined;
  try { sanitizeHeaders({ "X-Ok": "a\nb" }); } catch (e) { err = e; }
  check("CRLF in header value rejected", !!err);
  const ok = sanitizeHeaders({ "X-Ok": "value" });
  check("valid header kept", ok["X-Ok"] === "value");
}

server.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
