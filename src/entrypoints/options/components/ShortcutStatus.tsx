import { isFirefox, openShortcutSettings, firefoxShortcutInstructions } from "../../../shared/browser-platform";
import React, { useEffect, useState } from "react";

interface CommandBinding { name?: string; shortcut?: string }

export function ShortcutStatus({ en }: { en: boolean }) {
  const [error, setError] = useState("");
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

  return <div className="shortcut-status feature-shortcut">
    <span><strong>{t("全文翻译", "Page translation")}：</strong><kbd>{shortcut === undefined ? "…" : shortcut || t("未绑定", "Not assigned")}</kbd></span>
    {isFirefox() ? <small>{firefoxShortcutInstructions(en)}</small> : <button type="button" onClick={() => { void openShortcutSettings().catch(() => setError(t("请打开浏览器的扩展快捷键设置。", "Open your browser’s extension shortcut settings."))); }}>{t("设置快捷键", "Set shortcut")}</button>}
    {error && <small role="alert">{error}</small>}
  </div>;
}
