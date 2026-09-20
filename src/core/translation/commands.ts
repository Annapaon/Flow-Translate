import { getSettings } from "../../shared/settings";

export async function handleTranslationCommand(command: string, tab?: { id?: number; windowId?: number }) {
  if (command !== "translate-page") return;
  const id = tab?.id ?? (await browser.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (id === undefined) return;
  const settings = await getSettings();
  if (!settings.pageTranslationEnabled || !settings.privacyConsentAccepted) return;
  await browser.tabs.sendMessage(id, { type: "page-shortcut" });
}
