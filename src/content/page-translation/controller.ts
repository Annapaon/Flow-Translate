import { pickRegion } from "./region";
import { forWebsite } from "../../shared/reading-settings";
import { isTargetLanguagePage } from "../../core/translation/page-preflight";
import {
  collectGroupsAsync,
  spreadSample,
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
import { pageAccessReason, pageAccessMessage, type PageAccessReason } from "../../shared/page-access";
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
  unavailableReason?: PageAccessReason;
  timings?: { planningMs: number; firstTranslationMs?: number; totalMs?: number; scans: number };
}
export function installPageTranslation() {
  const blocks = new Map<Node, Block>();
  let scope: HTMLElement | undefined;
  let cancelPicker: (() => void) | undefined;
  let autoCheck = 0;
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
  let markSettingsReady: (() => void) | undefined;
  const settingsReady = new Promise<void>(resolve => { markSettingsReady = resolve; });
  let autoTimer: ReturnType<typeof setTimeout> | undefined;
  let autoSuppressed = false;
  let pageHidden = false;
  let startedAt = 0;
  let planningMs = 0;
  let firstTranslationMs: number | undefined;
  let totalMs: number | undefined;
  let scans = 0;
  const accessReason = () => pageAccessReason(settings, location.href, window.top === window, Boolean(document.body));
  function eligible() { return !accessReason(); }
  function rejectedStatus() {
    const reason = accessReason();
    return { ...status(), error: reason ? pageAccessMessage(reason, settings?.uiLanguage === "en") : error };
  }
  function scheduleAuto() {
    clearTimeout(autoTimer);
    const check = ++autoCheck;
    if (pageHidden || autoSuppressed || !eligible() || settings?.pageTranslationMode !== "auto" || !["idle", "skipped-target"].includes(state)) return;
    autoTimer = setTimeout(() => { void (async () => {
      const snapshot = settings;
      const revision = epoch;
      if (!snapshot || !eligible()) return;
      const groups = await collectGroupsAsync(document.body, () => check === autoCheck && epoch === revision, { steps: 1200, groups: 200 });
      const visible = groups.filter(g => { const rect = g.owner.getBoundingClientRect(); return rect.bottom > 0 && rect.top < innerHeight; });
      // When nothing collected near the top of the document is on screen (the
      // user scrolled, or the page opens with off-screen leading blocks), fall
      // back to a spread sample of the whole walk instead of disabling the check.
      const sampleGroups = visible.length ? visible : groups;
      const skip = await isTargetLanguagePage(spreadSample(sampleGroups, 12).map(g => serialize(g).text), snapshot);
      if (check !== autoCheck || epoch !== revision || snapshot !== settings || !eligible() || !["idle", "skipped-target"].includes(state)) return;
      if (skip) { state = "skipped-target"; error = "页面已是目标语言 / Page already matches the target language"; }
      else void start();
      // A failed preflight must not silently auto-translate an already-
      // target-language page; leave the page idle and let the user start it.
    })().catch(() => {}); }, 400);
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
    const counts = { total: 0, done: 0, failed: 0, skipped: 0, pending: 0, characters: 0 };
    for (const block of blocks.values()) {
      counts.total++; counts.characters += block.source.text.length;
      if (block.state === "done") counts.done++;
      else if (block.state === "failed") counts.failed++;
      else if (block.state === "skipped") counts.skipped++;
      else counts.pending++;
    }
    return {
      state, ...counts, target, service, error, degraded,
      unavailableReason: accessReason(),
      timings: { planningMs, firstTranslationMs, totalMs, scans }
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
    autoCheck++;
    cancelPicker?.(); cancelPicker = undefined;
    scope = undefined;
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
    scans++;
    if (["idle", "skipped-target", "selecting"].includes(state)) return;
    if (scope && !scope.isConnected) { restore(); autoSuppressed = true; return; }
    const version = ++scanVersion;
    const revision = epoch;
    const groups = await collectGroupsAsync(
      scope ?? document.body,
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
      .map(block => ({ block, distance: viewportDistance(block) }))
      .sort((a, b) => a.distance - b.distance)
      .map(entry => entry.block)
      .slice(0, Math.max(0, concurrency * batchSize - active));
    if (!next.length && !active) {
      state = "completed";
      if (![...blocks.values()].some(block => block.state === "failed")) error = "";
      totalMs = performance.now() - startedAt;
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
            firstTranslationMs ??= performance.now() - startedAt;
            restyle(b.host, b.group.owner, settings?.translationStyle);
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
        firstTranslationMs ??= performance.now() - startedAt;
        restyle(b.host, b.group.owner, settings?.translationStyle);
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
  async function start(override?: string, resume = false, region?: HTMLElement) {
    if (!eligible()) return;
    if (!resume) restore();
    else close();
    if (region) scope = region;
    startedAt = performance.now(); planningMs = 0; firstTranslationMs = undefined; totalMs = undefined; scans = 0;
    state = "starting";
    error = "";
    if (resume) budget += 100_000;
    connect();
    const revision = epoch;
    try {
      let initialGroups = await collectGroupsAsync(
        scope ?? document.body,
        () => epoch === revision,
        // Walk the full step budget and spread the sample across it, so the
        // language plan is not decided by unrepresentative top-of-page chrome.
        { steps: 1200, groups: 200 },
      );
      if (epoch !== revision) return;
      if (!initialGroups.length) initialGroups = await collectGroupsAsync(scope ?? document.body, () => epoch === revision);
      const sample = spreadSample(initialGroups, 12)
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
      planningMs = performance.now() - startedAt;
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
          if (scope && scope.isConnected && records.every(r => !scope!.contains(r.target))) return;
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
    async (message: { type?: string; action?: string; target?: string }) => {
      if (message.type === "page-shortcut") {
        if (eligible() && !["running", "starting"].includes(state)) {
          autoSuppressed = false;
          void start(undefined, state === "paused");
        }
        return status();
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
        if (["start", "region", "retry", "resume"].includes(message.action ?? "") && accessReason() === "settings-loading") {
          await Promise.race([
            settingsReady,
            new Promise<void>(resolve => setTimeout(resolve, 2000))
          ]);
        }
        if (message.action === "region") {
          if (!eligible()) return rejectedStatus();
          if (!["idle", "skipped-target"].includes(state)) { error = "请先恢复原文再选择区域 / Restore originals before selecting a region"; return status(); }
          autoSuppressed = true; clearTimeout(autoTimer); restore(); state = "selecting";
          cancelPicker = pickRegion(root => { cancelPicker = undefined; void start(undefined, false, root); }, () => { cancelPicker = undefined; state = "idle"; }, settings?.uiLanguage === "en");
          return status();
        }
        if (["pause", "restore"].includes(message.action ?? "")) autoSuppressed = true;
        if (["start", "resume", "retry"].includes(message.action ?? "") && !eligible()) return rejectedStatus();
        if (message.action === "start") void start(message.target);
        if (message.action === "pause") pause();
        if (message.action === "resume" && state === "paused")
          void start(undefined, true);
        if (message.action === "restore") restore();
        if (message.action === "retry") {
          error = "";
          for (const b of blocks.values())
            if (b.state === "failed") b.state = "pending";
          if (state === "paused") void start(undefined, true);
          else {
            state = "running";
            void pump();
          }
        }
        return status();
      }
      if (message.type === "page-status") return status();
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
    settings = forWebsite({ ...next, ...next.featurePreferences?.page }, location.href);
    markSettingsReady?.(); markSettingsReady = undefined;
    next = settings;
    updateStyle();
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
  const autoObserver = new MutationObserver(records => {
    if (records.every(r => (r.target instanceof Element && r.target.closest(`[${HOST}]`)) ||
      (r.type === "childList" && [...r.addedNodes, ...r.removedNodes].every(n => n instanceof Element && n.hasAttribute(HOST))))) return;
    scheduleAuto();
  });
  autoObserver.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  function updateStyle() {
    for (const b of blocks.values()) if (b.host) restyle(b.host, b.group.owner, settings?.translationStyle);
  }
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
