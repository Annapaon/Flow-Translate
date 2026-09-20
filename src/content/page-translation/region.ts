import { HOST, isExcluded } from "./dom";

/** A local, disposable region picker. Never submits selected text itself. */
export function pickRegion(
  onChoose: (root: HTMLElement) => void,
  onCancel: () => void,
  english: boolean
) {
  const overlay = document.createElement("div");
  overlay.setAttribute(HOST, "picker");
  overlay.style.cssText =
    "all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647";
  const shadow = overlay.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent =
    ":host{all:initial}.outline{position:fixed;border:2px solid #8b5cf6;border-radius:8px;background:#8b5cf614;pointer-events:none;box-sizing:border-box}.help{position:fixed;top:16px;left:50%;transform:translateX(-50%);max-width:90vw;padding:12px 18px;border-radius:12px;background:#faf8ff;color:#342557;border:1px solid #c4b5fd;box-shadow:0 8px 24px #0002;font:14px/1.6 system-ui;pointer-events:auto}button{font:inherit;margin-left:10px;border:1px solid #c4b5fd;border-radius:8px;background:#ede9fe;color:#5b21b6;padding:4px 10px;cursor:pointer}";
  const box = document.createElement("div");
  box.className = "outline";
  box.hidden = true;
  const help = document.createElement("div");
  help.className = "help";
  help.setAttribute("role", "status");
  help.append(
    document.createTextNode(
      english
        ? "Point and click a region. ↑ selects its parent; Enter confirms; Esc cancels."
        : "指向并点击区域；↑ 选择上级正文，Enter 确认，Esc 取消。"
    )
  );
  const cancel = document.createElement("button");
  cancel.textContent = english ? "Cancel" : "取消";
  help.append(cancel);
  shadow.append(style, box, help);
  document.documentElement.append(overlay);
  document.documentElement.setAttribute("data-flow-selecting", "");
  document.dispatchEvent(new Event("flow-region-select"));
  let candidate: HTMLElement | undefined;
  let finished = false;
  const paint = () => {
    if (!candidate?.isConnected) {
      box.hidden = true;
      return;
    }
    const r = candidate.getBoundingClientRect();
    box.hidden = false;
    Object.assign(box.style, {
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`
    });
  };
  const move = (event: PointerEvent) => {
    if (event.composedPath().includes(overlay)) return;
    const element =
      event.target instanceof HTMLElement ? event.target : undefined;
    candidate =
      element && !isExcluded(element)
        ? (element.closest<HTMLElement>(
            "p,article,section,main,li,td,th,blockquote,h1,h2,h3,h4,div"
          ) ?? element)
        : undefined;
    paint();
  };
  const clean = () => {
    finished = true;
    overlay.remove();
    document.documentElement.removeAttribute("data-flow-selecting");
    document.removeEventListener("pointermove", move, true);
    document.removeEventListener("pointerdown", suppress, true);
    document.removeEventListener("pointerup", suppress, true);
    document.removeEventListener("click", click, true);
    document.removeEventListener("keydown", key, true);
    window.removeEventListener("scroll", paint, true);
    window.removeEventListener("resize", paint);
  };
  const stop = () => {
    if (!finished) {
      clean();
      onCancel();
    }
  };
  const choose = () => {
    if (candidate?.isConnected && !isExcluded(candidate)) {
      const root = candidate;
      clean();
      onChoose(root);
    }
  };
  const suppress = (e: Event) => {
    if (!e.composedPath().includes(overlay)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  const click = (e: MouseEvent) => {
    if (e.composedPath().includes(overlay)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    choose();
  };
  const key = (e: KeyboardEvent) => {
    if (!["Escape", "Enter", "ArrowUp"].includes(e.key)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === "Escape") stop();
    if (e.key === "Enter") choose();
    if (
      e.key === "ArrowUp" &&
      candidate?.parentElement &&
      candidate.parentElement !== document.documentElement &&
      !isExcluded(candidate.parentElement)
    ) {
      candidate = candidate.parentElement;
      paint();
    }
  };
  cancel.onclick = stop;
  document.addEventListener("pointermove", move, true);
  document.addEventListener("pointerdown", suppress, true);
  document.addEventListener("pointerup", suppress, true);
  document.addEventListener("click", click, true);
  document.addEventListener("keydown", key, true);
  window.addEventListener("scroll", paint, true);
  window.addEventListener("resize", paint);
  return () => {
    if (!finished) clean();
  };
}
