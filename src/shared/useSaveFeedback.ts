import { useCallback, useEffect, useRef, useState } from "react";

export function useSaveFeedback(en: boolean) {
  const [pending, setPending] = useState(0);
  const [notice, setNotice] = useState<{ text: string; error: boolean }>();
  const revision = useRef(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; revision.current++; }; }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(undefined), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  const run = useCallback(async (operation: () => Promise<void>) => {
    const current = ++revision.current;
    setPending(value => value + 1); setNotice(undefined);
    try {
      await operation();
      if (alive.current && current === revision.current) setNotice({ text: en ? "Saved" : "已保存", error: false });
    } catch {
      if (alive.current && current === revision.current) setNotice({ text: en ? "Unable to save. Please retry." : "保存失败，请重试。", error: true });
    } finally { if (alive.current) setPending(value => value - 1); }
  }, [en]);
  return { saving: pending > 0, notice, run };
}
