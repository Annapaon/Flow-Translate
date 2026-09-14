import { test as base, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { createServer, type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { DEFAULT_SETTINGS, DEFAULT_PUBLIC_SETTINGS, type TriggerMode, type TranslatorSettings } from "../../src/shared/types";

interface ModelRequest { model?: string; source: string; aborted: boolean; response: ServerResponse; batch?: string[] }
interface Extension {
  page: Page;
  requests: ModelRequest[];
  configure: (mode: TriggerMode) => Promise<void>;
  finish: (index: number) => void;
  control: (action: string, target?: string) => Promise<any>;
  pageStatus: () => Promise<any>;
  settings: (patch: Partial<TranslatorSettings>) => Promise<void>;
  machine: (provider?: "microsoft" | "baidu" | "google" | "deepl") => Promise<void>;
  options: () => Promise<Page>;
}

export const test = base.extend<{ extension: Extension }>({
  extension: async ({}, use) => {
    const requests: ModelRequest[] = [];
    const server = createServer(async (req, res) => {
      if (req.url?.startsWith("/machine")) {
        let raw = ""; for await (const c of req) raw += c;
        const provider = req.url.split("?")[0]!.split("/").pop();
        const body = provider === "baidu" ? Object.fromEntries(new URLSearchParams(raw)) : JSON.parse(raw);
        const texts: string[] = provider === "microsoft" ? body.map((x: any) => x.Text) : provider === "baidu" ? [body.q] : provider === "google" ? body.q : body.text;
        const translated = texts.map(t => t.replace(/First/g,"第一").replace(/Second/g,"第二").replace(/nested text/g,"嵌套文字") + " 译文");
        requests.push({source:texts.join("\n"),aborted:false,response:res});
        res.writeHead(200, {"Content-Type":"application/json"});
        res.end(JSON.stringify(provider === "microsoft" ? translated.map(text=>({translations:[{text}]})) : provider === "baidu" ? {trans_result:translated.map(dst=>({dst}))} : provider === "google" ? {data:{translations:translated.map(translatedText=>({translatedText}))}} : {translations:translated.map(text=>({text}))})); return;
      }
      if (req.url !== "/v1/chat/completions") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<!doctype html><title>Selection fixture</title><style>body { padding:40px; font:20px sans-serif } p { margin:30px 0 } #outside { position:fixed; top:5px; left:5px }</style>
          <p id="first">First paragraph for translation.</p>
          <p id="second">Second paragraph with <strong>nested text</strong>.</p>
          <p id="same">First paragraph for translation.</p>
          <input id="input" value="Input selection text"><textarea id="textarea">Textarea selection text</textarea>
          <div id="outside">Outside</div>`);
        return;
      }
      let body = "";
      for await (const chunk of req) body += chunk;
      const messages = JSON.parse(body).messages;
      const source = messages[1].content as string;
      const batch = messages[0].content.includes("输入为 JSON 行")
        ? source.split("<source_text>\n")[1]!.split("\n</source_text>")[0]!.split("\n").map(line => {
            const row = JSON.parse(line); return JSON.stringify({ id: row.id, text: row.text + "译文完成" }) + "\n";
          }) : undefined;
      const request = { source, model: JSON.parse(body).model as string, aborted: false, response: res, batch };
      requests.push(request);
      res.on("close", () => { if (!res.writableEnded) request.aborted = true; });
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: batch?.[0] ?? "译文" } }] })}\n\n`);
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No server port");
    const origin = `http://127.0.0.1:${address.port}`;
    const profile = await mkdtemp(join(tmpdir(), "flow-translate-e2e-"));
    let context: BrowserContext | undefined;
    try {
      const extensionPath = resolve(".output/chrome-mv3");
      context = await chromium.launchPersistentContext(profile, {
        channel: "chromium",
        headless: true,
        args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
      });
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
      const page = await context.newPage();
      const configure = async (mode: TriggerMode) => {
        const settings = { ...DEFAULT_SETTINGS, privacyConsentAccepted: true, uiLanguage: "en" as const,
          enableCache: false, triggerMode: mode, apiBaseUrl: `${origin}/v1`, model: "test-model", apiKey: "e2e-placeholder",
          modelProfiles: [{ ...DEFAULT_SETTINGS.modelProfiles[0]!, apiBaseUrl: `${origin}/v1`, model: "test-model", apiKey: "e2e-placeholder" }] };
        const publicSettings = { ...DEFAULT_PUBLIC_SETTINGS, privacyConsentAccepted: true, uiLanguage: "en" as const,
          triggerMode: mode, model: "test-model" };
        await worker.evaluate(async ({ settings, publicSettings }) => {
          await (globalThis as any).chrome.storage.local.set({ translatorSettings: settings, publicTranslatorSettings: publicSettings });
        }, { settings, publicSettings });
        await page.goto(origin);
        await expect(page.locator("#flow-translate-root")).toBeAttached();
        // A selection probes receipt of the asynchronous public-settings port message.
        await expect(async () => {
          await select(page, "#first");
          if (mode === "click") await expect(page.getByRole("button", { name: "Translate selection", exact: true })).toBeVisible();
          else await expect(page.getByRole("region", { name: "Translation result" })).toBeVisible();
        }).toPass();
        await page.locator("#outside").click();
        await expect(page.locator(".card")).toHaveCount(0);
        await expect.poll(() => requests.every((request) => request.aborted || request.response.writableEnded)).toBe(true);
        requests.length = 0;
      };
      const settings = async (patch: Partial<TranslatorSettings>) => {
        await worker.evaluate(async patch => { const api=(globalThis as any).chrome; const stored=await api.storage.local.get(["translatorSettings","publicTranslatorSettings"]); await api.storage.local.set({translatorSettings:{...stored.translatorSettings,...patch},publicTranslatorSettings:{...stored.publicTranslatorSettings,...Object.fromEntries(Object.entries(patch).filter(([key])=>["blockedSites","allowedSites","siteAccessMode","pageTranslationEnabled","pageTranslationMode","bidirectional","pairSourceLanguage","pairLanguage","targetLanguage","privacyConsentAccepted","triggerMode"].includes(key)))}}); },patch);
      };
      const control = async (action: string, target?: string) => worker.evaluate(async ({action,target,url}) => { const api=(globalThis as any).chrome; const tabs=await api.tabs.query({}); const tab=tabs.find((t:any)=>t.url?.startsWith(url)); return api.tabs.sendMessage(tab.id,{type:"page-control",action,target}); },{action,target,url:origin});
      const pageStatus = async () => worker.evaluate(async url => { const api=(globalThis as any).chrome;const tabs=await api.tabs.query({});return api.tabs.sendMessage(tabs.find((t:any)=>t.url?.startsWith(url)).id,{type:"page-status"}); },origin);
      const machine = async (provider: "microsoft" | "baidu" | "google" | "deepl" = "microsoft") => { await settings({provider,apiBaseUrl:`${origin}/machine/${provider}`,modelProfiles:[{...DEFAULT_SETTINGS.modelProfiles[0]!,provider,apiBaseUrl:`${origin}/machine/${provider}`,apiKey:"e2e-key",appId:"app-id",region:"global",model:""}]}); };
      const options = async () => { const p=await context!.newPage();await p.goto(`chrome-extension://${new URL(worker.url()).host}/options.html`);return p; };
      await use({ page, requests, configure, settings, control, pageStatus, machine, options, finish: (index) => {
        requests[index]!.response.end(`data: ${JSON.stringify({ choices: [{ delta: { content: requests[index]!.batch?.slice(1).join("") ?? "完成" } }] })}\n\ndata: [DONE]\n\n`);
      } });
    } finally {
      await context?.close();
      server.closeAllConnections();
      await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
      await rm(profile, { recursive: true, force: true });
    }
  }
});

export async function select(page: Page, selector: string, pointerup = true) {
  await page.locator(selector).evaluate((element, firePointerUp) => {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.focus();
      element.setSelectionRange(0, element.value.length);
    } else {
      (document.activeElement as HTMLElement)?.blur();
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    }
    if (firePointerUp) element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  }, pointerup);
}
export { expect };
