import React, { useEffect, useState } from "react";

interface CommandBinding { name?: string; shortcut?: string }

function shortcutSettingsUrl(): string {
  return navigator.userAgent.includes("Edg/") ? "edge://extensions/shortcuts" : "chrome://extensions/shortcuts";
}

export function ShortcutStatus({ en }: { en: boolean }) {
  const [shortcut, setShortcut] = useState<string>();
  const t = (zh: string, english: string) => en ? english : zh;
  useEffect(() => {
    let alive = true;
    const read = () => { void browser.commands.getAll().then((all: CommandBinding[]) => {
      if (alive) setShortcut(all.find(item => item.name === "translate-page")?.shortcut ?? "");
    }).catch(() => { if (alive) setShortcut(""); }); };
    read();
    document.addEventListener("visibilitychange", read);
    return () => { alive = false; document.removeEventListener("visibilitychange", read); };
  }, []);

  const openShortcutSettings = () => {
    const url = shortcutSettingsUrl();
    void browser.tabs.create({ url }).catch(() => window.open(url, "_blank"));
  };

  return <div className="shortcut-status feature-shortcut">
    <span><strong>{t("全文翻译", "Page translation")}：</strong><kbd>{shortcut === undefined ? "…" : shortcut || t("未绑定", "Not assigned")}</kbd></span>
    <button type="button" onClick={openShortcutSettings}>{t("设置快捷键", "Set shortcut")}</button>
  </div>;
}
