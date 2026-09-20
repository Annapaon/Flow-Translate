import React, { useEffect, useState } from "react";

interface CommandBinding { name?: string; shortcut?: string }

/**
 * Chrome binds manifest suggested_key shortcuts (Alt+Q / Alt+T) on install,
 * but silently skips a key when another extension already uses it, and there
 * is no API to bind a shortcut programmatically. Per the Chrome docs, check
 * commands.getAll() and point the user at chrome://extensions/shortcuts when
 * a command is unbound.
 */
export function ShortcutStatus({ en }: { en: boolean }) {
  const [bindings, setBindings] = useState<Record<string, string>>();
  useEffect(() => {
    let alive = true;
    // Also re-check when the page becomes visible: the user may have just
    // changed bindings on chrome://extensions/shortcuts in another tab.
    const read = () => { void browser.commands.getAll().then((all: CommandBinding[]) => {
      if (alive) setBindings(Object.fromEntries(all.map(command => [command.name ?? "", command.shortcut ?? ""])));
    }); };
    read();
    document.addEventListener("visibilitychange", read);
    return () => { alive = false; document.removeEventListener("visibilitychange", read); };
  }, []);
  if (!bindings) return null;
  const page = bindings["translate-page"] ?? "";
  const selection = bindings["translate-selection"] ?? "";
  const t = (zh: string, english: string) => en ? english : zh;
  return <div className="shortcut-status">
    <strong>{t("快捷键", "Keyboard shortcuts")}</strong>
    <p>
      {t("全文翻译", "Translate page")}：<kbd>{page || t("未绑定", "not bound")}</kbd>
      {" · "}
      {t("划词翻译", "Translate selection")}：<kbd>{selection || t("未绑定", "not bound")}</kbd>
    </p>
    {(!page || !selection) && <p className="shortcut-hint">{t("部分快捷键未生效（可能与其他扩展冲突）。请点击", "Some shortcuts are not active (possibly conflicting with another extension). Please click ")}
      <a href="chrome://extensions/shortcuts" title="chrome://extensions/shortcuts" onClick={(event) => {
        event.preventDefault();
        // Opening a chrome:// URL requires tabs.create from the extension
        // context; a plain link navigation would be blocked.
        void browser.tabs.create({ url: "chrome://extensions/shortcuts" }).catch(() => window.open("chrome://extensions/shortcuts", "_blank"));
      }}>{t("这里", "here")}</a>
      {t("手动设置。", " to set them manually.")}</p>}
  </div>;
}
