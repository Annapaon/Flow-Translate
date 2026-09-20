export function pageStateLabel(state: string, en: boolean): string {
  const labels: Record<string, [string, string]> = {
    idle: ["尚未开始", "Not started"], starting: ["正在准备翻译", "Preparing translation"],
    running: ["正在翻译", "Translating"], paused: ["已暂停", "Paused"],
    completed: ["翻译完成", "Translation complete"], selecting: ["正在选择区域", "Selecting a region"],
    "skipped-target": ["页面已是目标语言", "Page already matches target language"]
  };
  return labels[state]?.[en ? 1 : 0] ?? (en ? "Translation status" : "翻译状态");
}
