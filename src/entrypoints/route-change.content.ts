import { ROUTE_CHANGE_EVENT } from "../shared/constants";

/**
 * MAIN-world watcher for SPA route changes (plan §4.1). Content scripts run
 * in an isolated world where patching `history` would not intercept the
 * page's own calls, so this minimal script runs in the page world, wraps
 * pushState/replaceState, and re-broadcasts navigation as a plain DOM event
 * that crosses into the isolated world. It reads no page data; the only
 * effect a page could trigger by spoofing the event is closing our overlay.
 */
export default defineContentScript({
  world: "MAIN",
  matches: ["<all_urls>"],
  runAt: "document_start",
  main() {
    const notify = () => {
      document.dispatchEvent(new CustomEvent(ROUTE_CHANGE_EVENT, { detail: { url: location.href } }));
    };
    // Both history methods share this signature; typing them as one avoids a
    // union that Parameters<> cannot spread.
    type HistoryNav = (data: any, unused: string, url?: string | URL | null) => void;
    const patch = (method: "pushState" | "replaceState") => {
      const original = window.history[method] as HistoryNav;
      window.history[method] = function (this: History, ...args: Parameters<HistoryNav>) {
        const result = original.apply(this, args);
        notify();
        return result;
      } as HistoryNav;
    };
    patch("pushState");
    patch("replaceState");
  }
});
