/** Runtime detection also works in Firefox's background page. */
export function isFirefox(): boolean {
  return browser.runtime.getURL("/").startsWith("moz-extension://");
}

/** Call synchronously from a user click, before any storage or tab lookups. */
export function openLongTextPanel(): Promise<void> {
  if (isFirefox()) {
    // WXT's shared browser types describe Chromium; Firefox exposes this API.
    const firefox = browser as typeof browser & {
      sidebarAction: { open(): Promise<void> };
    };
    return firefox.sidebarAction.open();
  }
  return browser.sidePanel.open({
    windowId: browser.windows.WINDOW_ID_CURRENT
  });
}

export function firefoxShortcutInstructions(en: boolean): string {
  return en
    ? "Open about:addons → gear menu → Manage Extension Shortcuts."
    : "请打开 about:addons → 齿轮菜单 → 管理扩展快捷键。";
}

export async function openShortcutSettings(): Promise<void> {
  // Firefox forbids tabs.create() for privileged about: pages.
  if (isFirefox()) throw new Error(firefoxShortcutInstructions(false));
  const url = navigator.userAgent.includes("Edg/")
    ? "edge://extensions/shortcuts"
    : "chrome://extensions/shortcuts";
  await browser.tabs.create({ url });
}
