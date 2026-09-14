import {
  collectGroupsAsync,
  serialize,
  render,
  restyle,
  HOST,
  type Group,
  type Serialized,
} from "./dom";
import {
  languageCode,
  detect,
  hasTranslatableText,
} from "../../core/translation/language";
import { ROUTE_CHANGE_EVENT } from "../../shared/constants";
import { blockedUrl } from "../../shared/site-access";
import type { PublicTranslatorSettings, ServerMessage } from "../../shared/types";
interface Block {
  id: string;
  group: Group;
  source: Serialized;
  state: "pending" | "running" | "done" | "failed" | "skipped";
  host?: HTMLElement;
  changes: number;
}
export interface PageStatus {
  state: string;
  total: number;
  done: number;
  failed: number;
  skipped: number;
  pending: number;
  characters: number;
  target: string;
  service: string;
  error: string;
  degraded: number;
}
export function installPageTranslation() {
  const blocks = new Map<Node, Block>();
  let port: ReturnType<typeof browser.runtime.connect> | null = null;
  let observer: MutationObserver | undefined;
  let state = "idle",
    target = "",
    service = "",
    error = "",
    html = false,
    concurrency = 2,
    batchSize = 1,
    budget = 100_000,
    used = 0,
    degraded = 0;
  let scanVersion = 0;
  let epoch = 0,
    scanTimer: ReturnType<typeof setTimeout> | undefined;
  let oldUrl = location.href;
  let settings: PublicTranslatorSettings | undefined;
  let autoTimer: ReturnType<typeof setTimeout> | undefined;
  let autoSuppressed = false;
  let pageHidden = false;
  function eligible() {
    return Boolean(settings?.pageTranslationEnabled && settings.privacyConsentAccepted &&
      !settings.paused && !blockedUrl(location.href, settings) &&
      /^https?:$/.test(location.protocol) && window.top === window && document.body);
  }
  function scheduleAuto() {
    clearTimeout(autoTimer);
    if (pageHidden || autoSuppressed || !eligible() || settings?.pageTranslationMode !== "auto" || state !== "idle") return;
    autoTimer = setTimeout(() => {
      if (!pageHidden && !autoSuppressed && eligible() && settings?.pageTranslationMode === "auto" && state === "idle") void start();
    }, 400);
  }
  const pending = new Map<
    string,
    {
      resolve: (v: {
        text: string;
        start?: Extract<ServerMessage, { type: "start" }>;
      }) => void;
      reject: (e: Error) => void;
      text: string;
      update?: (text: string) => void;
      start?: Extract<ServerMessage, { type: "start" }>;
    }
  >();
  function status(): PageStatus {
    const all = [...blocks.values()];
    return {
      state,
      total: all.length,
      done: all.filter((b) => b.state === "done").length,
      failed: all.filter((b) => b.state === "failed").length,
      skipped: all.filter((b) => b.state === "skipped").length,
      pending: all.filter((b) => b.state === "pending" || b.state === "running")
        .length,
      characters: all.reduce((n, b) => n + b.source.text.length, 0),
      target,
      service,
      error,
      degraded,
    };
  }
  function close() {
    epoch++;
    const previous = port;
    port = null;
    previous?.disconnect();
    for (const p of pending.values()) p.reject(new Error("Cancelled"));
    pending.clear();
    for (const b of blocks.values())
      if (b.state === "running") { b.state = "pending"; b.host?.remove(); b.host = undefined; }
  }
  function pause(reason = "") {
    state = "paused";
    error = reason;
    close();
  }
  function restore() {
    state = "idle";
    close();
    observer?.disconnect();
    observer = undefined;
    clearTimeout(scanTimer);
    for (const b of blocks.values()) b.host?.remove();
    blocks.clear();
    budget = 100_000;
    used = 0;
    degraded = 0;
    error = "";
  }
  function request(message: object, id: string, update?: (text: string) => void) {
    return new Promise<{
      text: string;
      start?: Extract<ServerMessage, { type: "start" }>;
    }>((resolve, reject) => {
      pending.set(id, { resolve, reject, text: "", update });
      try {
        port!.postMessage(message);
      } catch {
        pending.delete(id);
        reject(new Error("Service disconnected"));
      }
    });
  }
  function connect() {
    const current = browser.runtime.connect({ name: "page-translation" });
    port = current;
    current.onMessage.addListener((m: ServerMessage) => {
      if (m.type === "error" && m.requestId === "session" && m.fatal) {
        pause(m.message);
        return;
      }
      const p = pending.get(m.requestId);
      if (!p) return;
      if (m.type === "start") p.start = m;
      if (m.type === "delta") { p.text += m.text; p.update?.(p.text); }
      if (m.type === "retry") { p.text = ""; p.update?.(""); }
      if (m.type === "finish") {
        pending.delete(m.requestId);
        p.resolve(p);
      }
      if (m.type === "error") {
        pending.delete(m.requestId);
        p.reject(new Error(m.message));
        if (m.fatal) pause(m.message);
      }
    });
    current.onDisconnect.addListener(() => {
      if (port === current)
        pause(
          "后台连接已断开，请继续 / Service disconnected; resume to reconnect",
        );
    });
  }
  async function scan() {
    if (state === "idle") return;
    const version = ++scanVersion;
    const revision = epoch;
    const groups = await collectGroupsAsync(
      document.body,
      () => version === scanVersion && epoch === revision && state !== "idle",
    );
    if (version !== scanVersion || epoch !== revision || state === "idle")
      return;
    const found = new Set<Node>();
    for (const group of groups) {
      found.add(group.anchor);
      const source = serialize(group);
      if (!hasTranslatableText(source.text)) continue;
      const existing = blocks.get(group.anchor);
      if (existing && existing.source.html === source.html) continue;
      existing?.host?.remove();
      if (existing?.state === "running")
        port?.postMessage({ type: "cancel", requestId: existing.id });
      blocks.set(group.anchor, {
        id: crypto.randomUUID(),
        group,
        source,
        state:
          (existing?.changes ?? 0) >= 3 ||
          ["flex", "inline-flex", "grid", "inline-grid"].includes(
            getComputedStyle(group.owner).display,
          )
            ? "skipped"
            : "pending",
        changes: (existing?.changes ?? -1) + 1,
      });
    }
    for (const [anchor, b] of blocks)
      if (!anchor.isConnected || !found.has(anchor)) {
        b.host?.remove();
        if (b.state === "running")
          port?.postMessage({ type: "cancel", requestId: b.id });
        blocks.delete(anchor);
      }
    if (
      state === "completed" &&
      [...blocks.values()].some((b) => b.state === "pending")
    )
      state = "running";
    void pump();
  }
  function viewportDistance(block: Block) {
    const rect = block.group.owner.getBoundingClientRect();
    if (rect.bottom >= 0 && rect.top <= window.innerHeight) return 0;
    return rect.top > window.innerHeight ? rect.top - window.innerHeight : -rect.bottom;
  }
  async function pump() {
    if (state !== "running" || !port) return;
    const active = [...blocks.values()].filter(
      (b) => b.state === "running",
    ).length;
    const next = [...blocks.values()]
      .filter((b) => b.state === "pending")
      .sort((a, b) => viewportDistance(a) - viewportDistance(b))
      .slice(0, Math.max(0, concurrency * batchSize - active));
    if (!next.length && !active) {
      state = "completed";
      return;
    }
    for (const b of next) {
      if (used + b.source.text.length > budget) {
        pause(
          "达到处理预算，继续可处理剩余内容 / Budget reached; resume for more",
        );
        return;
      }
      used += b.source.text.length;
      b.state = "running";
      const revision = epoch;
      let previewTimer: ReturnType<typeof setTimeout> | undefined;
      let previewText = "";
      const valid = () => revision === epoch && state === "running" &&
        blocks.get(b.group.anchor) === b && b.group.anchor.isConnected &&
        serialize(b.group).html === b.source.html;
      const preview = (text: string) => {
        previewText = text;
        if (!text) { clearTimeout(previewTimer); previewTimer = undefined; b.host?.remove(); b.host = undefined; return; }
        previewTimer ??= setTimeout(() => {
          previewTimer = undefined;
          if (!valid()) return;
          b.host?.remove();
          try {
            b.host = render(b.group, b.source, previewText, html && b.source.html.length <= 5000, languageCode(target)).host;
            b.host.setAttribute("aria-busy", "true");
          } catch { /* Final rendering handles unsupported layouts. */ }
        }, 80);
      };
      void (async () => {
        const detected = await detect(
          b.source.text,
          b.group.owner.closest("[lang]")?.getAttribute("lang") ?? "",
        );
        if (revision !== epoch || state !== "running") return;
        if (
          !detected.uncertain &&
          languageCode(detected.language) === languageCode(target)
        ) {
          b.state = "skipped";
          return;
        }
        const rich = html && b.source.html.length <= 5000;
        const response = await request(
          {
            type: "translate",
            requestId: b.id,
            text: rich ? b.source.html : b.source.text,
            format: rich ? "html" : "text",
          },
          b.id,
          preview,
        );
        clearTimeout(previewTimer);
        if (
          revision !== epoch ||
          blocks.get(b.group.anchor) !== b ||
          !b.group.anchor.isConnected ||
          serialize(b.group).html !== b.source.html
        )
          return;
        b.host?.remove();
        b.host = undefined;
        const rendered = render(
          b.group,
          b.source,
          response.text,
          rich,
          languageCode(target),
        );
        b.host = rendered.host;
        if (rendered.degraded) degraded++;
        b.state = "done";
      })()
        .catch((e) => {
          if (revision === epoch) {
            b.host?.remove(); b.host = undefined;
            b.state = e.message.includes("Unsupported layout block")
              ? "skipped"
              : "failed";
            error = e.message;
          }
        })
        .finally(() => {
          clearTimeout(previewTimer);
          if (revision === epoch) {
            if (b.state === "running") b.state = "pending";
            void pump();
          }
        });
    }
  }
  async function start(override?: string, resume = false) {
    if (!eligible()) return;
    if (!resume) restore();
    else close();
    state = "starting";
    error = "";
    if (resume) budget += 100_000;
    connect();
    const revision = epoch;
    try {
      const initialGroups = await collectGroupsAsync(
        document.body,
        () => epoch === revision,
      );
      if (epoch !== revision) return;
      const sample = initialGroups
        .map((g) => serialize(g).text)
        .join("\n")
        .slice(0, 10000);
      if (!sample.trim()) {
        restore();
        error = "没有可翻译的页面文字 / No page text";
        return;
      }
      const id = crypto.randomUUID();
      const plan = await request(
        {
          type: "page-start",
          requestId: id,
          text: sample,
          langHint: document.documentElement.lang,
          target: resume ? target : override,
        },
        id,
      );
      if (revision !== epoch) return;
      target = plan.start?.targetLanguage ?? "";
      service = plan.start?.serviceName ?? "";
      html = Boolean(plan.start?.html);
      concurrency = Math.max(1, Math.min(6, plan.start?.maxConcurrency ?? 2));
      batchSize = Math.max(1, Math.min(4, plan.start?.batchSize ?? 1));
      state = "running";
      if (!observer) {
        observer = new MutationObserver((records) => {
          if (
            records.every(
              (r) =>
                (r.target instanceof Element &&
                  r.target.closest(`[${HOST}]`)) ||
                (r.type === "childList" &&
                  [...r.addedNodes, ...r.removedNodes].every(
                    (n) => n instanceof Element && n.hasAttribute(HOST),
                  )),
            )
          )
            return;
          clearTimeout(scanTimer);
          scanTimer = setTimeout(() => {
            void scan();
          }, 150);
        });
        observer.observe(document.body, {
          subtree: true,
          childList: true,
          characterData: true,
        });
      }
      void scan();
    } catch (e) {
      if (revision === epoch) pause(e instanceof Error ? e.message : "Failed");
    }
  }
  browser.runtime.onMessage.addListener(
    (message: { type?: string; action?: string; target?: string }) => {
      if (message.type === "page-shortcut") {
        if (eligible() && !["running", "starting"].includes(state)) {
          autoSuppressed = false;
          void start(undefined, state === "paused");
        }
        return Promise.resolve(status());
      }
      if (message.type === "page-preview") {
        return collectGroupsAsync(document.body, () => true).then((groups) => ({
          characters: groups.reduce(
            (sum, group) => sum + serialize(group).text.length,
            0,
          ),
          blocks: groups.length,
        }));
      }
      if (message.type === "page-control") {
        if (["pause", "restore"].includes(message.action ?? "")) autoSuppressed = true;
        if (["start", "resume", "retry"].includes(message.action ?? "") && !eligible()) return Promise.resolve(status());
        if (message.action === "start") void start(message.target);
        if (message.action === "pause") pause();
        if (message.action === "resume" && state === "paused")
          void start(undefined, true);
        if (message.action === "restore") restore();
        if (message.action === "retry") {
          for (const b of blocks.values())
            if (b.state === "failed") b.state = "pending";
          if (state === "paused") void start(undefined, true);
          else {
            state = "running";
            void pump();
          }
        }
        return Promise.resolve(status());
      }
      if (message.type === "page-status") return Promise.resolve(status());
      if (message.type === "access-changed") restore();
    },
  );
  document.addEventListener("flow-access-disabled", restore);
  const route = () => {
    if (oldUrl !== location.href) {
      oldUrl = location.href;
      restore();
      autoSuppressed = false;
      scheduleAuto();
    }
  };
  document.addEventListener(ROUTE_CHANGE_EVENT, route);
  window.addEventListener("popstate", route);
  window.addEventListener("hashchange", route);
  window.addEventListener("pagehide", () => { pageHidden = true; clearTimeout(autoTimer); restore(); });
  window.addEventListener("pageshow", () => { pageHidden = false; scheduleAuto(); });
  // A separate settings channel also works before the selection overlay has mounted.
  const settingsPort = browser.runtime.connect({ name: "public-settings" });
  settingsPort.onMessage.addListener((next: PublicTranslatorSettings) => {
    const previous = settings;
    settings = next;
    if (!eligible()) { clearTimeout(autoTimer); restore(); return; }
    if (previous?.pageTranslationMode === "auto" && next.pageTranslationMode !== "auto") {
      clearTimeout(autoTimer);
      if (["running", "starting"].includes(state)) pause();
    }
    if (!previous?.pageTranslationEnabled || previous.pageTranslationMode !== next.pageTranslationMode || previous.paused) autoSuppressed = false;
    scheduleAuto();
  });
  settingsPort.onDisconnect.addListener(() => { settings = undefined; clearTimeout(autoTimer); restore(); });
  // Empty application shells can receive their first readable content after load.
  const autoObserver = new MutationObserver(() => scheduleAuto());
  autoObserver.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  const updateStyle = () => {
    for (const b of blocks.values()) if (b.host) restyle(b.host, b.group.owner);
  };
  window.addEventListener("resize", updateStyle);
  matchMedia("(prefers-color-scheme: dark)").addEventListener(
    "change",
    updateStyle,
  );
  const theme = new MutationObserver(updateStyle);
  theme.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });
}
