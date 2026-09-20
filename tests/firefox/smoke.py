"""Firefox smoke test using geckodriver and Python's standard library.

Build with npm run zip:firefox, then set FIREFOX_BINARY and GECKODRIVER.
Only a disposable browser profile and a local mock translation API are used.
"""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[2]
ADDON_ID = "flow-translate@annapaon.github.io"
UUID = "15b2a074-2f81-4d98-8079-52e24fa9de30"
EXTENSION = f"moz-extension://{UUID}"
requests = []


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(b'<!doctype html><title>Firefox fixture</title><p id="first">English text for translation testing.</p>')

    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        assert self.headers.get("Authorization") == "Bearer firefox-test-key"
        requests.append(payload)
        messages = payload["messages"]
        output = "Firefox test translation complete"
        if "输入为 JSON 行" in messages[0]["content"]:
            rows = messages[1]["content"].split("<source_text>\n")[1].split("\n</source_text>")[0]
            output = "".join(json.dumps({"id": row["id"], "text": output}) + "\n" for row in map(json.loads, rows.splitlines()))
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        self.wfile.write(('data: ' + json.dumps({"choices": [{"delta": {"content": output}}]}) + '\n\ndata: [DONE]\n\n').encode())


def wait(check, timeout=15):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        try:
            value = check()
            if value:
                return value
        except Exception as error:
            last = error
        time.sleep(0.1)
    raise AssertionError(f"Condition timed out: {last}")


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
origin = f"http://127.0.0.1:{server.server_port}"
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
base = f"http://127.0.0.1:{port}"


def api(path, data=None, method=None):
    request = urllib.request.Request(base + path, data=json.dumps(data).encode() if data is not None else None,
                                     headers={"Content-Type": "application/json"}, method=method)
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return json.load(response)["value"]
    except urllib.error.HTTPError as error:
        raise RuntimeError(error.read().decode()) from error


session = None
with tempfile.TemporaryFile(mode="w+") as log:
    driver = subprocess.Popen([os.environ.get("GECKODRIVER", "geckodriver"), "--allow-system-access", "--port", str(port), "--log", "warn"], stdout=log, stderr=log)
    try:
        wait(lambda: api("/status"))
        options = {"args": ["-headless"], "prefs": {"extensions.webextensions.uuids": json.dumps({ADDON_ID: UUID})}}
        if os.environ.get("FIREFOX_BINARY"):
            options["binary"] = os.environ["FIREFOX_BINARY"]
        value = api("/session", {"capabilities": {"alwaysMatch": {"browserName": "firefox", "moz:firefoxOptions": options}}})
        session = "/session/" + value["sessionId"]
        api(session + "/timeouts", {"script": 15000})
        package = ROOT / ".output/flow-translate-1.0.0-firefox-unsigned.zip"
        assert api(session + "/moz/addon/install", {"path": str(package), "temporary": True}) == ADDON_ID

        def script(code, *args):
            return api(session + "/execute/sync", {"script": code, "args": list(args)})

        def async_script(code, *args):
            result = api(session + "/execute/async", {"script": "const done=arguments[arguments.length-1]; (async()=>{" + code + "})().then(value=>done({value}),error=>done({error:String(error)}));", "args": list(args)})
            assert "error" not in result, result
            return result.get("value")

        def navigate(url):
            api(session + "/url", {"url": url})

        def click(css):
            element = api(session + "/element", {"using": "css selector", "value": css})
            api(session + "/element/" + element["element-6066-11e4-a52e-4f735466cecf"] + "/click", {})

        navigate(EXTENSION + "/options.html")
        wait(lambda: script("return document.body.innerText.includes('数据处理说明')"))
        settings = {"privacyConsentAccepted": True, "uiLanguage": "en", "enableCache": False, "triggerMode": "click", "activeModelId": "firefox-test", "keyStorage": "local", "modelProfiles": [{"id": "firefox-test", "enabled": True, "name": "Firefox test", "provider": "openai-compatible", "apiBaseUrl": origin + "/v1", "apiKey": "firefox-test-key", "model": "test", "temperature": 0.2, "timeoutMs": 60000, "maxConcurrency": 2, "maxOutputTokens": 2048, "authMode": "bearer", "customHeaders": {"X-Test": "private-test-header"}}]}
        async_script("""
          const value=arguments[0];
          await new Promise((resolve,reject)=>{
            const open=indexedDB.open('flow-translate',2);
            open.onerror=()=>reject(open.error);
            open.onsuccess=()=>{
              const db=open.result; const tx=db.transaction('private-settings','readwrite');
              tx.objectStore('private-settings').put(value,'settings');
              tx.oncomplete=()=>{db.close();resolve()}; tx.onerror=()=>reject(tx.error);
            };
          });
          await browser.storage.local.set({privateSettingsRevision:crypto.randomUUID()});
        """, settings)
        navigate(EXTENSION + "/options.html")
        wait(lambda: script("return document.body.innerText.includes('Models')"))
        # Exercise the rendered options UI after loading the private fixture.
        script("document.querySelectorAll('button')[Array.from(document.querySelectorAll('button')).findIndex(b=>b.textContent.includes('Page translation'))].click()")
        wait(lambda: script("return document.body.innerText.includes('about:addons')"))
        local = async_script("return await browser.storage.local.get(null)")
        assert "firefox-test-key" not in json.dumps(local)
        assert "private-test-header" not in json.dumps(local)
        assert isinstance(async_script("return await browser.runtime.sendMessage({type:'get-history'})"), list)
        print("PASS: Firefox options, shortcut guidance, background messages and credential isolation")

        options_handle = api(session + "/window")
        new = api(session + "/window/new", {"type": "tab"})
        api(session + "/window", {"handle": new["handle"]})
        navigate(EXTENSION + "/popup.html")
        wait(lambda: script("return document.body.innerText.includes('Long text')"))
        click('button[title="Open long text translator"]')
        api(session + "/window", {"handle": options_handle})
        assert async_script("return await browser.sidebarAction.isOpen({})")
        print("PASS: popup user gesture opens Firefox sidebar")

        navigate(EXTENSION + "/sidepanel.html")
        wait(lambda: script("return !!document.querySelector('textarea')"))
        textarea = api(session + "/element", {"using": "css selector", "value": "textarea"})
        api(session + "/element/" + textarea["element-6066-11e4-a52e-4f735466cecf"] + "/value", {"text": "English text to translate in Firefox."})
        click('button.primary')
        wait(lambda: script("return document.querySelector('.output')?.textContent.includes('Firefox test translation complete')"))
        print("PASS: long-text translation through background and local streaming API")

        navigate(origin)
        wait(lambda: script("return !!document.querySelector('#flow-translate-root')?.shadowRoot"))
        script("const r=document.createRange();r.selectNodeContents(document.querySelector('#first'));getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new Event('selectionchange'))")
        wait(lambda: script("return !!document.querySelector('#flow-translate-root').shadowRoot.querySelector('.trigger')"))
        script("document.querySelector('#flow-translate-root').shadowRoot.querySelector('.trigger').click()")
        wait(lambda: script("return document.querySelector('#flow-translate-root').shadowRoot.textContent.includes('Firefox test translation complete')"))
        # MAIN-world SPA notification must cross Firefox's isolated-world boundary.
        script("history.pushState({},'', '/route-two')")
        wait(lambda: script("return !document.querySelector('#flow-translate-root').shadowRoot.querySelector('.card')"))
        print("PASS: selection translation and SPA route cleanup")

        new = api(session + "/window/new", {"type": "tab"})
        page_handle = api(session + "/window")
        api(session + "/window", {"handle": new["handle"]})
        navigate(EXTENSION + "/options.html")
        print("Page start:", async_script("const tabs=await browser.tabs.query({});const tab=tabs.find(t=>t.url?.startsWith(arguments[0]));return await browser.tabs.sendMessage(tab.id,{type:'page-control',action:'start'})", origin))
        api(session + "/window", {"handle": page_handle})
        try:
            wait(lambda: script("return !!document.querySelector('[data-flow-translation]')?.shadowRoot?.textContent.includes('Firefox test translation complete')"))
        except AssertionError:
            print("Page DOM:", script("return {url:location.href,body:document.body.innerText}"))
            api(session + "/window", {"handle": new["handle"]})
            print("Page status:", async_script("const tabs=await browser.tabs.query({});const tab=tabs.find(t=>t.url?.startsWith(arguments[0]));return await browser.tabs.sendMessage(tab.id,{type:'page-status'})", origin))
            raise
        print("PASS: full-page translation")
        print(f"Firefox {value['capabilities']['browserVersion']}: all smoke checks passed ({len(requests)} mock API calls).")
    finally:
        if session:
            api(session, method="DELETE")
        driver.terminate()
        driver.wait(timeout=10)
        server.shutdown()
