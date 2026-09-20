import { storage } from "wxt/utils/storage";
import { useEffect, useState } from "react";
import { patchSettings } from "./settings";

// Each surface's acknowledgement is independent: confirming the popup notice
// ("翻译前请确认") must not confirm the options notice ("数据处理说明") or
// vice versa. The settings flag is only the translation gate, not an
// acknowledgement, and is never used to derive these.
export const popupNotice = storage.defineItem<boolean>("local:popupPrivacyNoticeAccepted", { defaultValue: false });
export const optionsNotice = storage.defineItem<boolean>("local:optionsPrivacyNoticeAccepted", { defaultValue: false });

export function usePrivacyNotice(surface: "popup" | "options") {
  const item = surface === "popup" ? popupNotice : optionsNotice;
  const [accepted, setAccepted] = useState<boolean>();
  useEffect(() => {
    let alive = true;
    const unwatch = item.watch(value => { if (alive) setAccepted(value === true); });
    void item.getValue().then(value => { if (alive) setAccepted(value === true); });
    return () => { alive = false; unwatch(); };
  }, [item]);
  return { accepted, confirm: () => item.setValue(true) };
}

/** Confirming one surface's notice acknowledges only that surface. The global
 *  settings flag is the translation gate (content script, sidepanel, page
 *  controls) and is set by whichever notice the user confirms. */
export async function confirmPrivacyConsent(surface: "popup" | "options"): Promise<void> {
  const item = surface === "popup" ? popupNotice : optionsNotice;
  await item.setValue(true);
  await patchSettings({ privacyConsentAccepted: true });
}

export async function resetPrivacyNotices() {
  await Promise.all([popupNotice.setValue(false), optionsNotice.setValue(false)]);
}
