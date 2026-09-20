import { DEFAULT_TRANSLATION_STYLE } from "../../shared/reading-settings";
import type { TranslationStyle } from "../../shared/types";
import { parseFragment } from "parse5";
export const HOST = "data-flow-translation";
const excluded =
  "script,style,noscript,iframe,svg,canvas,math,pre,input,textarea,select,button,nav,header[role=banner],[role=navigation],[role=button],[contenteditable]:not([contenteditable=false]),[translate=no],.notranslate,[hidden],[aria-hidden=true],#flow-translate-root,[data-flow-translation]";
export const isExcluded = (element: HTMLElement) => Boolean(element.closest(excluded));
const blockTags = new Set([
  "P",
  "DIV",
  "SECTION",
  "ARTICLE",
  "MAIN",
  "ASIDE",
  "FOOTER",
  "HEADER",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "UL",
  "OL",
  "LI",
  "TABLE",
  "THEAD",
  "TBODY",
  "TR",
  "TD",
  "TH",
  "BLOCKQUOTE",
  "FIGCAPTION",
  "DL",
  "DT",
  "DD",
]);
export interface Group {
  owner: HTMLElement;
  nodes: Node[];
  anchor: Node;
}
export interface Inline {
  tag: string;
  href?: string;
  code?: string;
}
export interface Serialized {
  text: string;
  html: string;
  inline: Map<string, Inline>;
}
const escape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
function* groupSteps(root: HTMLElement): Generator<Group | null> {
  function* walk(owner: HTMLElement): Generator<Group | null> {
    yield null;
    if (owner.matches(excluded)) return;
    const style = getComputedStyle(owner);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse" ||
      style.contentVisibility === "hidden"
    )
      return;
    let nodes: Node[] = [];
    function* flush(): Generator<Group> {
      if (nodes.some((n) => n.textContent?.trim()))
        yield { owner, nodes, anchor: nodes[nodes.length - 1]! };
      nodes = [];
    }
    for (const node of [...owner.childNodes]) {
      yield null;
      if (node instanceof HTMLElement) {
        if (node.matches(excluded)) {
          yield* flush();
          continue;
        }
        const display = getComputedStyle(node).display;
        if (
          blockTags.has(node.tagName) ||
          ["block", "flex", "grid", "list-item", "table-cell"].includes(display)
        ) {
          yield* flush();
          yield* walk(node);
          continue;
        }
      }
      if (node.nodeType === Node.TEXT_NODE || node instanceof HTMLElement)
        nodes.push(node);
    }
    yield* flush();
  }
  yield* walk(root);
}
export function collectGroups(root: HTMLElement): Group[] {
  return [...groupSteps(root)].filter(
    (group): group is Group => group !== null,
  );
}
export async function collectGroupsAsync(
  root: HTMLElement,
  valid: () => boolean,
  limits?: { steps: number; groups: number },
): Promise<Group[]> {
  const groups: Group[] = [];
  let count = 0;
  for (const group of groupSteps(root)) {
    if (!valid()) return [];
    if (group) groups.push(group);
    if (limits && (++count >= limits.steps || groups.length >= limits.groups)) break;
    if (count % 100 === 0)
      await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return groups;
}
/** Evenly spaced subset in document order, so detection sees the whole page
 *  rather than only its first blocks (cookie banners, headers, nav chrome). */
export function spreadSample<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const step = (items.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => items[Math.round(i * step)]!);
}
export function serialize(group: Group): Serialized {
  const inline = new Map<string, Inline>();
  let text = "";
  function node(n: Node): string {
    if (n.nodeType === Node.TEXT_NODE) {
      text += n.textContent ?? "";
      return escape(n.textContent ?? "");
    }
    if (!(n instanceof HTMLElement) || n.matches(excluded)) return "";
    const style = getComputedStyle(n);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.contentVisibility === "hidden") return "";
    if (n.tagName === "BR") {
      text += "\n";
      return "<br>";
    }
    const inner = [...n.childNodes].map(node).join("");
    const tag = n.tagName.toLowerCase();
    if (!["strong", "em", "b", "i", "u", "a", "code", "span"].includes(tag))
      return inner;
    const id = String(inline.size);
    const href =
      tag === "a" && /^https?:/.test((n as HTMLAnchorElement).href)
        ? (n as HTMLAnchorElement).href
        : undefined;
    inline.set(id, {
      tag,
      href,
      code: tag === "code" ? (n.textContent ?? "") : undefined,
    });
    return `<${["a", "code"].includes(tag) ? "span" : tag} data-ft-id="${id}">${inner}</${["a", "code"].includes(tag) ? "span" : tag}>`;
  }
  const html = "<span>" + group.nodes.map(node).join("") + "</span>";
  return { text: text.trim(), html, inline };
}
const typography = [
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "color",
  "text-align",
  "text-indent",
  "text-transform",
  "word-spacing",
];
export function restyle(host: HTMLElement, owner: HTMLElement, preferences: TranslationStyle = DEFAULT_TRANSLATION_STYLE) {
  const source = getComputedStyle(owner);
  for (const property of typography)
    host.style.setProperty(property, source.getPropertyValue(property));
  host.style.setProperty("display", "block", "important");
  host.style.setProperty("position", "static", "important");
  host.style.setProperty("height", "auto", "important");
  host.style.setProperty("max-height", "none", "important");
  host.style.setProperty("white-space", "pre-wrap", "important");
  host.style.setProperty("overflow-wrap", "anywhere", "important");
  host.style.setProperty("font-size", `${parseFloat(source.fontSize) * preferences.scale}px`, "important");
  if (Number.isFinite(parseFloat(source.lineHeight))) host.style.setProperty("line-height", `${parseFloat(source.lineHeight) * preferences.scale}px`, "important");
  host.style.setProperty("margin-block", `${preferences.spacing}em ${preferences.spacing * 1.3}em`, "important");
  host.style.setProperty("padding", "0.55em 0.8em", "important");
  host.style.setProperty("border-radius", "9px", "important");
  const dark = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
  const colors = { purple: dark ? "167,139,250" : "109,92,231", blue: dark ? "147,197,253" : "66,133,244", neutral: dark ? "203,213,225" : "100,116,139" };
  const color = colors[preferences.tone];
  host.style.setProperty("background-color", preferences.background ? `rgba(${color},${dark ? 0.1 : 0.06})` : "transparent", "important");
  host.style.setProperty("border", preferences.background ? `1px solid rgba(${color},${dark ? 0.16 : 0.1})` : "1px solid transparent", "important");
}
export function render(
  group: Group,
  serialized: Serialized,
  result: string,
  html: boolean,
  language: string,
) {
  const layout = getComputedStyle(group.owner);
  if (["flex", "inline-flex", "grid", "inline-grid"].includes(layout.display))
    throw new Error("此布局块无法安全插入 / Unsupported layout block");
  const host = document.createElement("span");
  host.setAttribute(HOST, "");
  host.lang = language;
  host.dir = "auto";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent =
    ":host{box-sizing:border-box}a{color:inherit;text-decoration:underline}code{font-family:monospace}";
  shadow.append(style);
  let degraded = false;
  if (html) {
    const fragment = parseFragment(result);
    const seen = new Set<string>();
    const content = document.createDocumentFragment();
    function visit(n: any, parent: Node) {
      if (n.nodeName === "#text") {
        parent.appendChild(document.createTextNode(n.value));
        return;
      }
      if (!n.tagName) {
        for (const c of n.childNodes ?? []) visit(c, parent);
        return;
      }
      if (!["span", "strong", "em", "b", "i", "u", "br"].includes(n.tagName))
        throw new Error("Unexpected markup");
      const attributes = n.attrs ?? [];
      if (attributes.some((a: any) => a.name !== "data-ft-id"))
        throw new Error("Unexpected attributes");
      const id = attributes.find((a: any) => a.name === "data-ft-id")?.value;
      const original = id === undefined ? undefined : serialized.inline.get(id);
      if (id !== undefined && (!original || seen.has(id)))
        throw new Error("Invalid inline identity");
      if (id !== undefined) seen.add(id);
      const el = document.createElement(original?.tag ?? n.tagName);
      if (original?.href) {
        (el as HTMLAnchorElement).href = original.href;
        (el as HTMLAnchorElement).rel = "noopener noreferrer";
      }
      if (original?.code !== undefined) el.textContent = original.code;
      else for (const c of n.childNodes ?? []) visit(c, el);
      parent.appendChild(el);
    }
    try {
      visit(fragment, content);
      if (seen.size !== serialized.inline.size)
        throw new Error("Missing inline identity");
      shadow.append(content);
    } catch {
      degraded = true;
      const plain = (n: any): string =>
        n.nodeName === "#text"
          ? n.value
          : ["script", "style", "iframe"].includes(n.tagName)
            ? ""
            : (n.childNodes ?? []).map(plain).join("");
      shadow.append(document.createTextNode(plain(fragment)));
    }
  } else shadow.append(document.createTextNode(result));
  restyle(host, group.owner);
  group.anchor.parentNode!.insertBefore(host, group.anchor.nextSibling);
  return { host, degraded };
}
